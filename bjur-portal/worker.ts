import "dotenv/config";
import { mkdirSync } from "fs";
import { rm } from "fs/promises";
import { createServer } from "http";
import path from "path";
import chokidar from "chokidar";
import { db } from "./src/lib/db";
import { INBOX_ROOT, DERIVED_ROOT, resolveMediaPath } from "./src/lib/media";
import { ingestFile } from "./src/lib/ingest";
import { generateProxy, generateMarkedRenditions } from "./src/lib/proxyGen";
import { syncAllSocialAccounts } from "./src/lib/socialSync";
import { publishDuePosts } from "./src/lib/publisher";
import { sendExpiryReminders } from "./src/lib/clientMail";
import { processCaptionQueue } from "./src/lib/captionPipeline";
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

  // Same reasoning for watermarking: a deploy mid-encode would otherwise strand an asset
  // as GENERATING forever, and on a held project that asset is one the client can never
  // download — the routes refuse rather than fall back to the master.
  const marks = await db.asset.updateMany({
    where: { markStatus: "GENERATING" },
    data: { markStatus: "PENDING" },
  });
  if (marks.count) console.log(`[mark] reset ${marks.count} stranded GENERATING asset(s) back to PENDING`);
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

/**
 * The heartbeat is its own timer, not something the encode loops update on their way
 * past. It answers "is this process alive", and a worker three minutes into a
 * full-resolution watermark is very much alive — but while the tick that used to write
 * this was busy, nothing wrote it, and the dashboard started calling the worker down.
 */
function startHeartbeat() {
  const beat = () =>
    db.workerHeartbeat
      .upsert({ where: { id: 1 }, create: { id: 1 }, update: { lastSeen: new Date() } })
      .catch((err) => console.error("[worker] heartbeat failed:", err));
  beat();
  setInterval(beat, 15_000);
}

async function proxyLoopTick() {
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

/**
 * Watermarking gets its own loop, and its own guard.
 *
 * It shared the proxy tick, on the reasoning that both are ffmpeg on one CPU and running
 * them together would only make both slower. That was wrong in the way that matters: a
 * watermark is a full-resolution CRF 18 encode and a proxy is a 1080p CRF 26 one, so a
 * single mark held the tick for minutes while fifty-odd proxies sat PENDING behind it —
 * and a proxy is what the client's gallery needs to show anything at all.
 *
 * Two guarded loops means at most one of each at a time rather than one of either, which
 * is a bounded and much more useful place to spend the box.
 */
async function markLoopTick() {
  const unmarked = await db.asset.findMany({
    where: { markStatus: "PENDING" },
    take: CONCURRENCY,
    orderBy: { createdAt: "asc" },
  });

  for (const asset of unmarked) {
    console.log(`[mark] watermarking ${asset.id} (${asset.name})`);
    await generateMarkedRenditions(asset);
  }
}

/**
 * setInterval does not wait for an async callback, so without this guard the poll
 * interval — not CONCURRENCY — decides how much encoding runs at once: every tick starts
 * another ffmpeg beside the one still going. Harmless-looking with light proxy encodes
 * and genuinely damaging with full-resolution ones.
 */
function guardedInterval(name: string, tick: () => Promise<void>, ms: number) {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    tick()
      .catch((err) => console.error(`[${name}] tick failed:`, err))
      .finally(() => {
        running = false;
      });
  };
  run();
  setInterval(run, ms);
}

function startProxyLoop() {
  console.log(`[proxy] polling every ${POLL_MS}ms, concurrency ${CONCURRENCY}`);
  recoverStrandedProxies()
    .catch((err) => console.error("[proxy] failed to recover stranded assets:", err))
    .finally(() => {
      guardedInterval("proxy", proxyLoopTick, POLL_MS);
      guardedInterval("mark", markLoopTick, POLL_MS);
    });
}

/**
 * Refreshes view counts on linked Instagram/YouTube accounts.
 *
 * The day/time were configurable through SocialConfig, alongside the weekly digest's
 * schedule. The digest is gone and those columns went with it, but the sync is not a
 * client-facing send — it is what keeps Reports and the Integrations roll-up from showing
 * stale numbers — so it keeps running on a fixed weekly cadence instead. Nobody ever had
 * a reason to want it at a particular minute.
 */
function startWeeklySocialSyncScheduler() {
  let lastFiredOn: string | null = null;
  const SYNC_DAY = 2; // Tuesday, matching the old default
  const SYNC_HOUR = 9;

  const tick = async () => {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    if (now.getDay() !== SYNC_DAY || now.getHours() < SYNC_HOUR || lastFiredOn === dateKey) return;

    lastFiredOn = dateKey;
    console.log("[social] syncing linked Instagram/YouTube accounts");
    await syncAllSocialAccounts().catch((err) => console.error("[social] weekly sync failed:", err));
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

/**
 * Emails #3 and #5.
 *
 * The digest fires Monday 08:00 UTC and is guarded by a persisted marker rather than an
 * in-memory flag: the older digest scheduler tracks its last run in a variable, so a
 * restart on a Monday morning sends everything twice. Expiry is swept continuously
 * because its own marker lives on the project row.
 */
function startClientMailScheduler() {
  const tick = async () => {
    const { sent } = await sendExpiryReminders();
    if (sent > 0) console.log(`[client-mail] ${sent} expiry reminder(s) sent`);
  };

  console.log(`[client-mail] expiry scheduler checking every ${SCHEDULER_POLL_MS}ms`);
  tick().catch((err) => console.error("[client-mail] initial run failed:", err));
  setInterval(() => tick().catch((err) => console.error("[client-mail] tick failed:", err)), SCHEDULER_POLL_MS);
}

/**
 * Transcribes new reels and drafts their social copy.
 *
 * Same poll as the other schedulers rather than firing on ingest: transcription is a
 * paid network call per file, and a delivery of forty clips arriving at once should
 * drain steadily rather than open forty connections and hit a rate limit.
 */
function startCaptionScheduler() {
  const tick = async () => {
    const { done, noSpeech, failed } = await processCaptionQueue();
    if (done || noSpeech || failed) {
      console.log(`[captions] ${done} drafted, ${noSpeech} with no speech, ${failed} failed`);
    }
  };

  const on = Boolean(process.env.DEEPGRAM_API_KEY);
  console.log(
    `[captions] scheduler checking every ${SCHEDULER_POLL_MS}ms — ` +
      (on
        ? process.env.ANTHROPIC_API_KEY
          ? "transcribing and drafting"
          : "transcribing only, ANTHROPIC_API_KEY not set"
        : "idle, DEEPGRAM_API_KEY not set")
  );
  setInterval(() => tick().catch((err) => console.error("[captions] tick failed:", err)), SCHEDULER_POLL_MS);
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

startHeartbeat();
startIngestWatcher();
startInternalServer();
startProxyLoop();
startWeeklySocialSyncScheduler();
startDeliveryMailScheduler();
startSessionSweepScheduler();
startPublishScheduler();
startClientMailScheduler();
startCaptionScheduler();
