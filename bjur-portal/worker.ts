import "dotenv/config";
import { mkdirSync } from "fs";
import { rm } from "fs/promises";
import { createServer } from "http";
import path from "path";
import chokidar from "chokidar";
import { db } from "./src/lib/db";
import { INBOX_ROOT, DERIVED_ROOT, resolveMediaPath } from "./src/lib/media";
import { ingestFile } from "./src/lib/ingest";
import { generateProxy } from "./src/lib/proxyGen";
import { postWeeklyDigest, postWeeklyContentCalendar } from "./src/lib/slack";
import { syncAllSocialAccounts } from "./src/lib/socialSync";
import { publishDuePosts } from "./src/lib/publisher";
import { flushPendingDeliveries, DELIVERY_QUIET_MS } from "./src/lib/deliveryNotify";
import { SESSION_TTL_MS } from "./src/lib/auth";

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? "1", 10);
const POLL_MS = 4000;
const SCHEDULER_POLL_MS = 60_000;
const INGEST_PORT = parseInt(process.env.INGEST_PORT ?? "3100", 10);

mkdirSync(INBOX_ROOT, { recursive: true });

// The proxy loop below only ever picks up PENDING assets. If the worker process gets
// killed or restarted mid-encode (a deploy, a crash), whatever asset was GENERATING
// at that moment is stranded forever with no thumbnail, no proxy, and no retry. Reset
// any such orphans back to PENDING on startup — regenerating is always safe, it just
// overwrites the same output files.
async function recoverStrandedProxies() {
  const { count } = await db.asset.updateMany({
    where: { proxyStatus: "GENERATING" },
    data: { proxyStatus: "PENDING" },
  });
  if (count) console.log(`[proxy] reset ${count} stranded GENERATING asset(s) back to PENDING`);
}

// Neither NAS-server nor client-side SMB tooling actually produces clean file trees:
// Synology DSM mirrors every real file/folder with a hidden "@eaDir" metadata
// directory plus per-file "@SynoResource"/"@SynoEAStream" pseudo-files, macOS's SMB
// client drops transient ".smbdeleteXXXXXXXX" markers during copy/delete operations,
// and Finder leaves ".DS_Store" everywhere. None of these are real media — without
// filtering them out, ordinary file operations flood the ingest pipeline with paths
// that can never resolve to a project and just generate noisy failed-classification
// errors.
//
// ".uploading" is different: it's the admin upload route's own staging directory
// (see the upload route handler). Admin-panel uploads are streamed there first and
// only rename()'d into a real inbox path once fully written, specifically so this
// watcher never sees a partial file and fires ingestion on a truncated snapshot —
// so it must stay unwatched, not just filtered after the fact.
function isFilesystemArtifact(watchedPath: string) {
  const base = path.basename(watchedPath);
  return (
    base === "@eaDir" ||
    base.includes("@Syno") ||
    base === ".DS_Store" ||
    base.startsWith(".smbdelete") ||
    base === ".uploading"
  );
}

// The chokidar watcher below (for files editors drop directly onto the NAS over SMB)
// and the internal /ingest HTTP endpoint (for admin-panel browser uploads) both land
// files in the same INBOX_ROOT tree, so an admin upload fires both triggers for the
// same file: the HTTP handler calls ingestFile() directly right after the write
// finishes, and chokidar's own "add" event (delayed by awaitWriteFinish, but not
// reliably delayed *enough*) fires independently a moment later. With no coordination
// between them, both raced into moveFile()'s copyFile()+unlink() fallback (rename()
// always hits EXDEV here — _inbox and MEDIA_ROOT are separate bind mounts even though
// they're the same host tree) and wrote the same destination path concurrently,
// producing a file with a correct header but corrupted/interleaved sample data underneath
// — confirmed by a checksum mismatch between the uploaded file and what landed on disk.
// Sharing one in-flight map between both triggers means whichever fires first actually
// runs ingestFile(), and the other just awaits and reuses that same result instead of
// launching a second, colliding call.
const inFlightIngests = new Map<string, ReturnType<typeof ingestFile>>();

function ingestOnce(filePath: string) {
  const existing = inFlightIngests.get(filePath);
  if (existing) return existing;
  const promise = ingestFile(filePath).finally(() => inFlightIngests.delete(filePath));
  inFlightIngests.set(filePath, promise);
  return promise;
}

function startIngestWatcher() {
  // stabilityThreshold is how long a file's size must sit unchanged before we treat
  // the write as finished and hand it to ingestFile()/ffprobe. Local drag-and-drop
  // copies never pause mid-write, so a short window was fine there. Remote clients
  // copying masters in over scp/rsync-over-ssh are a different story: those transfers
  // can stall for several seconds (network hiccup, TCP backpressure, SSH rekey) without
  // being done. A stall longer than the old 2500ms window looked identical to "finished"
  // — ffprobe then read the partial file's real (short) duration as asset.durationSec,
  // which is also the baseline proxyGen.ts compares its proxy against, so the corrupted-
  // source safeguard there never caught it: source and proxy agreed, both silently short.
  // Widening the window doesn't change behavior for fast local copies, just makes the
  // watcher tolerant of the multi-second stalls that slower/remote transfers produce.
  const watcher = chokidar.watch(INBOX_ROOT, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 10_000, pollInterval: 1000 },
    depth: 4,
    ignored: isFilesystemArtifact,
  });

  // SQLite has a single writer: chokidar fires "add" independently for every file it
  // discovers, so a bulk folder copy (dozens of files at once) used to launch dozens
  // of truly concurrent ingestFile() calls that piled up and timed out contending for
  // the write lock. Chain them onto one queue so ingestion happens strictly one file
  // at a time, no matter how many "add" events land in the same instant.
  let queue: Promise<void> = Promise.resolve();

  // Belt-and-suspenders on top of ingest.ts's own ffprobe timeout: a genuinely stuck
  // OS-level read (a corrupted file wedged in uninterruptible I/O) can outlast even a
  // SIGKILL for minutes. Give up waiting on any single file after this long so the
  // queue keeps moving for everything behind it — the abandoned ingestFile() call is
  // still allowed to finish in the background and will register normally if it ever
  // does; this only stops it from blocking other files' turn.
  const INGEST_GIVE_UP_MS = 2 * 60_000;

  watcher.on("add", (filePath) => {
    if (inFlightIngests.has(filePath)) return;
    queue = queue.then(async () => {
      console.log(`[ingest] new file: ${filePath}`);
      const done = ingestOnce(filePath)
        .then((result) => {
          if (result) console.log(`[ingest] registered asset ${result.asset.id} (${result.asset.name})`);
        })
        .catch((err) => console.error(`[ingest] failed for ${filePath}:`, err));

      const gaveUp = await Promise.race([
        done.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), INGEST_GIVE_UP_MS)),
      ]);
      if (gaveUp) {
        console.error(
          `[ingest] ${filePath} still running after ${INGEST_GIVE_UP_MS / 1000}s — moving on to the next file; this one will still register if it eventually finishes`
        );
      }
    });
  });

  watcher.on("error", (err) => console.error("[ingest] watcher error:", err));
  console.log(`[ingest] watching ${INBOX_ROOT}`);
}

async function proxyLoopTick() {
  await db.workerHeartbeat.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: { lastSeen: new Date() },
  });

  const pending = await db.asset.findMany({
    where: { proxyStatus: "PENDING" },
    take: CONCURRENCY,
    orderBy: { createdAt: "asc" },
  });

  for (const asset of pending) {
    console.log(`[proxy] generating for ${asset.id} (${asset.name})`);
    await generateProxy(asset);
  }
}

function startProxyLoop() {
  console.log(`[proxy] polling every ${POLL_MS}ms, concurrency ${CONCURRENCY}`);
  const tick = () => proxyLoopTick().catch((err) => console.error("[proxy] tick failed:", err));
  recoverStrandedProxies()
    .catch((err) => console.error("[proxy] failed to recover stranded assets:", err))
    .finally(() => {
      tick();
      setInterval(tick, POLL_MS);
    });
}

function startWeeklyDigestScheduler() {
  let lastFiredOn: string | null = null;

  const tick = async () => {
    const config = await db.slackConfig.findUnique({ where: { id: 1 } });
    if (!config?.connected || !config.autoWeekly) return;

    const now = new Date();
    const today = now.toLocaleDateString("en-US", { weekday: "long" });
    const hhmm = now.toTimeString().slice(0, 5);
    const dateKey = now.toISOString().slice(0, 10);

    if (today === config.weeklyDay && hhmm === config.weeklyTime && lastFiredOn !== dateKey) {
      lastFiredOn = dateKey;
      console.log("[slack] posting weekly digest");
      await postWeeklyDigest().catch((err) => console.error("[slack] weekly digest failed:", err));
    }
  };

  console.log(`[slack] weekly digest scheduler checking every ${SCHEDULER_POLL_MS}ms`);
  setInterval(() => tick().catch((err) => console.error("[slack] scheduler tick failed:", err)), SCHEDULER_POLL_MS);
}

/**
 * Posts each opted-in client's content calendar for the week AHEAD — the block that
 * used to be generated by the admin "copy" button and pasted into Slack by hand.
 *
 * Fires on the client's own autoPostDay/autoPostHour (default Sunday 21:00) so the
 * calendar lands before the week it describes.
 *
 * Idempotency is stored on the row, not in memory. The weekly digest scheduler above
 * keeps `lastFiredOn` as a local variable, which means a container restart inside the
 * firing minute posts a second time — and this NAS restarts containers on its own.
 * Comparing a persisted lastPostedAt against the start of today survives that.
 */
function startWeeklyContentCalendarScheduler() {
  const tick = async () => {
    const config = await db.slackConfig.findUnique({ where: { id: 1 } });
    if (!config?.connected || !config.autoContentCalendar) return;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const channels = await db.clientChannel.findMany({ where: { autoPostSlack: true } });

    for (const ch of channels) {
      if (now.getDay() !== ch.autoPostDay || now.getHours() !== ch.autoPostHour) continue;
      if (ch.lastPostedAt && ch.lastPostedAt >= startOfToday) continue;

      // The Monday after today. Assets are grouped by weekOf, which is always a Monday.
      const weekStart = new Date(startOfToday);
      weekStart.setDate(weekStart.getDate() + ((8 - weekStart.getDay()) % 7 || 7));

      try {
        const result = await postWeeklyContentCalendar(ch.clientId, weekStart);
        // Stamp the row either way: a week with nothing scheduled is a decision not to
        // post, not a failure to retry sixty seconds later for the rest of the hour.
        await db.clientChannel.update({
          where: { clientId: ch.clientId },
          data: { lastPostedAt: now },
        });
        console.log(
          `[slack] content calendar ${ch.clientId} week of ${weekStart.toISOString().slice(0, 10)}: ` +
            (result.posted ? `posted ${result.assets} scheduled` : "nothing scheduled, skipped")
        );
      } catch (err) {
        // Leave lastPostedAt alone so the next tick retries within the same hour.
        console.error(`[slack] content calendar failed for ${ch.clientId}:`, err);
      }
    }
  };

  console.log(`[slack] content calendar scheduler checking every ${SCHEDULER_POLL_MS}ms`);
  setInterval(
    () => tick().catch((err) => console.error("[slack] content calendar tick failed:", err)),
    SCHEDULER_POLL_MS
  );
}

function startWeeklySocialSyncScheduler() {
  let lastFiredOn: string | null = null;

  const tick = async () => {
    const config = await db.socialConfig.findUnique({ where: { id: 1 } });
    if (!config?.autoWeekly) return;

    const now = new Date();
    const today = now.toLocaleDateString("en-US", { weekday: "long" });
    const hhmm = now.toTimeString().slice(0, 5);
    const dateKey = now.toISOString().slice(0, 10);

    if (today === config.weeklyDay && hhmm === config.weeklyTime && lastFiredOn !== dateKey) {
      lastFiredOn = dateKey;
      console.log("[social] syncing linked Instagram/YouTube accounts");
      await syncAllSocialAccounts().catch((err) => console.error("[social] weekly sync failed:", err));
    }
  };

  console.log(`[social] weekly sync scheduler checking every ${SCHEDULER_POLL_MS}ms`);
  setInterval(() => tick().catch((err) => console.error("[social] scheduler tick failed:", err)), SCHEDULER_POLL_MS);
}

// Delivery mail goes out from here rather than from the ingest path itself: a drop
// arrives one file at a time, so the decision to mail can only be made once the whole
// batch has settled. Each tick mails the projects that have gone quiet for
// DELIVERY_QUIET_MS. Piggybacks on the same SCHEDULER_POLL_MS poll as the schedulers
// above — a minute of granularity on a fifteen-minute debounce is irrelevant.
function startDeliveryMailScheduler() {
  const tick = async () => {
    const count = await flushPendingDeliveries();
    if (count > 0) console.log(`[delivery] flushed ${count} settled delivery batch(es)`);
  };

  const mode = process.env.DELIVERY_EMAILS === "live" ? "LIVE" : "dry run (logs to Activity)";
  console.log(
    `[delivery] mail scheduler checking every ${SCHEDULER_POLL_MS}ms, ` +
      `${DELIVERY_QUIET_MS / 60000}min quiet period — ${mode}`
  );
  setInterval(() => tick().catch((err) => console.error("[delivery] scheduler tick failed:", err)), SCHEDULER_POLL_MS);
}

/**
 * §13 auto-approve. A post the client was asked about, and did not act on, goes out at
 * the deadline rather than quietly missing its slot — that is the whole point of
 * Client.approvalAutoHours.
 *
 * heldAt is the escape hatch: a client who pressed Hold has said no, and Hold moves the
 * post back to DRAFT with approvalDueAt cleared, so it cannot be picked up here at all.
 * The state filter is what actually guarantees that; the heldAt check is belt and braces
 * against a row left inconsistent by an older code path.
 */
function startApprovalSweepScheduler() {
  const tick = async () => {
    const due = await db.asset.findMany({
      where: {
        publishState: "AWAITING",
        heldAt: null,
        approvalDueAt: { not: null, lte: new Date() },
      },
      select: { id: true, name: true, project: { select: { client: { select: { name: true } } } } },
    });
    if (due.length === 0) return;

    for (const asset of due) {
      await db.asset.update({
        where: { id: asset.id },
        data: { publishState: "APPROVED", approvedAt: new Date(), approvalDueAt: null },
      });
      // Recorded as the client's own approval-by-default, attributed to nobody, so the
      // history does not claim a person pressed a button they never pressed.
      await db.activity.create({
        data: {
          actor: "Portal",
          action: `auto-approved "${asset.name}" for ${asset.project.client.name} — no response before the deadline`,
        },
      });
    }
    console.log(`[approvals] auto-approved ${due.length} post(s) past their deadline`);
  };

  console.log(`[approvals] auto-approve sweep checking every ${SCHEDULER_POLL_MS}ms`);
  tick().catch((err) => console.error("[approvals] initial sweep failed:", err));
  setInterval(() => tick().catch((err) => console.error("[approvals] scheduler tick failed:", err)), SCHEDULER_POLL_MS);
}

/**
 * Publishes approved posts once their time comes.
 *
 * Polls on the same interval as the other schedulers rather than sleeping until the next
 * publishAt: a restart would lose a pending timer, and a post that missed its slot
 * because the NAS rebooted is exactly the failure this is supposed to prevent. Anything
 * already due is picked up on the next tick regardless of how long the worker was down.
 */
function startPublishScheduler() {
  const tick = async () => {
    const { published, failed, skipped } = await publishDuePosts();
    if (published || failed || skipped) {
      console.log(`[publish] ${published} published, ${failed} failed, ${skipped} already claimed`);
    }
  };

  const configured = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  console.log(
    `[publish] scheduler checking every ${SCHEDULER_POLL_MS}ms — ` +
      (configured ? "YouTube configured" : "idle, GOOGLE_OAUTH_CLIENT_ID/SECRET not set")
  );
  setInterval(() => tick().catch((err) => console.error("[publish] scheduler tick failed:", err)), SCHEDULER_POLL_MS);
}

// getSessionUser() (src/lib/auth.ts) only ever deletes an expired session lazily,
// when its own owner happens to come back — rows from users who never return
// accrete forever. Piggybacks on the same SCHEDULER_POLL_MS poll rather than a
// dedicated interval; a plain dateKey comparison (not a specific day/time like
// the schedulers above) is enough to make this fire roughly once per day.
function startSessionSweepScheduler() {
  let lastSweptOn: string | null = null;

  const tick = async () => {
    const dateKey = new Date().toISOString().slice(0, 10);
    if (lastSweptOn === dateKey) return;
    lastSweptOn = dateKey;

    const cutoff = new Date(Date.now() - SESSION_TTL_MS);
    const { count } = await db.session.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count > 0) console.log(`[sessions] swept ${count} expired session(s)`);
  };

  console.log(`[sessions] expiry sweep scheduler checking every ${SCHEDULER_POLL_MS}ms, runs ~daily`);
  tick().catch((err) => console.error("[sessions] initial sweep failed:", err));
  setInterval(() => tick().catch((err) => console.error("[sessions] scheduler tick failed:", err)), SCHEDULER_POLL_MS);
}

// The web container's media mount is read-only by design (it only ever streams, never
// writes production media) — but some admin actions need real writes/deletes under
// MEDIA_ROOT, which only this container has permission to do. Rather than either
// broadening web's write access (defeats the point of it being read-only) or relying
// on chokidar noticing a web-written file (proven unreliable — a file written by one
// container and watched by another didn't reliably cross that boundary in production),
// web calls these internal endpoints, and this container — which already holds the
// correct permissions — does the actual filesystem work. Not exposed outside the
// docker-compose network; only reachable container-to-container by service name, and
// gated by the same secret used for the other internal automation endpoint
// (CRON_SECRET).
function readJsonBody(req: import("http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function handleIngest(req: import("http").IncomingMessage, res: import("http").ServerResponse) {
  const { path: filePath } = await readJsonBody(req);
  if (typeof filePath !== "string" || !filePath.startsWith(INBOX_ROOT + path.sep)) {
    res.writeHead(400).end(JSON.stringify({ error: "Path must be inside INBOX_ROOT." }));
    return;
  }
  try {
    const result = await ingestOnce(filePath);
    res.writeHead(200).end(
      result
        ? JSON.stringify({ ingested: true, assetId: result.asset.id, capturedAt: result.capturedAt })
        : JSON.stringify({ ingested: false })
    );
  } catch (err) {
    res.writeHead(200).end(JSON.stringify({ ingested: false, note: (err as Error).message.slice(0, 200) }));
  }
}

async function handleDeleteAsset(req: import("http").IncomingMessage, res: import("http").ServerResponse) {
  const { assetId, relPath } = await readJsonBody(req);
  if (typeof assetId !== "string" || typeof relPath !== "string") {
    res.writeHead(400).end(JSON.stringify({ error: "assetId and relPath are required." }));
    return;
  }
  try {
    const mediaPath = await resolveMediaPath(relPath);
    await rm(mediaPath, { force: true });
    await rm(path.join(DERIVED_ROOT, assetId), { recursive: true, force: true });
    res.writeHead(200).end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(200).end(JSON.stringify({ ok: false, error: (err as Error).message.slice(0, 200) }));
  }
}

function startInternalServer() {
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      res.writeHead(401).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/ingest") {
      handleIngest(req, res).catch((err) => res.writeHead(500).end(JSON.stringify({ error: String(err) })));
    } else if (req.method === "POST" && req.url === "/delete-asset") {
      handleDeleteAsset(req, res).catch((err) => res.writeHead(500).end(JSON.stringify({ error: String(err) })));
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(INGEST_PORT, () => console.log(`[internal-server] listening on :${INGEST_PORT}`));
}

startIngestWatcher();
startInternalServer();
startProxyLoop();
startWeeklyDigestScheduler();
startWeeklyContentCalendarScheduler();
startWeeklySocialSyncScheduler();
startDeliveryMailScheduler();
startSessionSweepScheduler();
startApprovalSweepScheduler();
startPublishScheduler();
