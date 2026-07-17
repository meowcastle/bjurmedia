import "dotenv/config";
import { mkdirSync } from "fs";
import path from "path";
import chokidar from "chokidar";
import { db } from "./src/lib/db";
import { INBOX_ROOT } from "./src/lib/media";
import { ingestFile } from "./src/lib/ingest";
import { generateProxy } from "./src/lib/proxyGen";
import { postWeeklyDigest } from "./src/lib/slack";

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? "1", 10);
const POLL_MS = 4000;
const SCHEDULER_POLL_MS = 60_000;

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

function startIngestWatcher() {
  const watcher = chokidar.watch(INBOX_ROOT, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 2500, pollInterval: 500 },
    depth: 4,
    ignored: isFilesystemArtifact,
  });

  // fsevents can fire duplicate "add" events for the same file (e.g. a create + a
  // separate write-completion event); without this, both fire ingestFile concurrently
  // and race on the same rename.
  const inFlight = new Set<string>();

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
    if (inFlight.has(filePath)) return;
    inFlight.add(filePath);
    queue = queue.then(async () => {
      console.log(`[ingest] new file: ${filePath}`);
      const done = ingestFile(filePath)
        .then((asset) => {
          if (asset) console.log(`[ingest] registered asset ${asset.id} (${asset.name})`);
        })
        .catch((err) => console.error(`[ingest] failed for ${filePath}:`, err))
        .finally(() => inFlight.delete(filePath));

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

startIngestWatcher();
startProxyLoop();
startWeeklyDigestScheduler();
