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
import { postWeeklyDigest } from "./src/lib/slack";

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
function isFilesystemArtifact(watchedPath: string) {
  const base = path.basename(watchedPath);
  return base === "@eaDir" || base.includes("@Syno") || base === ".DS_Store" || base.startsWith(".smbdelete");
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
  const watcher = chokidar.watch(INBOX_ROOT, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 2500, pollInterval: 500 },
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
        .then((asset) => {
          if (asset) console.log(`[ingest] registered asset ${asset.id} (${asset.name})`);
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
    const asset = await ingestOnce(filePath);
    res.writeHead(200).end(asset ? JSON.stringify({ ingested: true, assetId: asset.id }) : JSON.stringify({ ingested: false }));
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
