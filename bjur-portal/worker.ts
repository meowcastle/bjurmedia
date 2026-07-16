import "dotenv/config";
import { mkdirSync } from "fs";
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

function startIngestWatcher() {
  const watcher = chokidar.watch(INBOX_ROOT, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 2500, pollInterval: 500 },
    depth: 4,
  });

  // fsevents can fire duplicate "add" events for the same file (e.g. a create + a
  // separate write-completion event); without this, both fire ingestFile concurrently
  // and race on the same rename.
  const inFlight = new Set<string>();

  watcher.on("add", async (filePath) => {
    if (inFlight.has(filePath)) return;
    inFlight.add(filePath);
    try {
      console.log(`[ingest] new file: ${filePath}`);
      const asset = await ingestFile(filePath);
      if (asset) console.log(`[ingest] registered asset ${asset.id} (${asset.name})`);
    } catch (err) {
      console.error(`[ingest] failed for ${filePath}:`, err);
    } finally {
      inFlight.delete(filePath);
    }
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
  tick();
  setInterval(tick, POLL_MS);
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
