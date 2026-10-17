import "dotenv/config";
import { rm } from "fs/promises";
import path from "path";
import { db } from "../src/lib/db";
import { DERIVED_ROOT } from "../src/lib/media";

/**
 * Re-watermarks a client's held projects with whatever mark the worker draws now.
 *
 * Marked renditions are made once and kept (a re-hold reuses them), so changing the mark
 * does nothing for files already marked. This throws those copies away and queues the
 * assets again; the running worker picks them up within a few seconds. Until each one is
 * redone the client's copy is refused, never handed over unmarked.
 *
 * Assets still PENDING or GENERATING are left alone: the current worker is marking them.
 *
 * Usage (on the NAS):
 *   sudo docker cp scripts/remark.ts bjur-portal-worker-1:/app/scripts/remark.ts
 *   sudo docker-compose exec worker npx tsx scripts/remark.ts "Snatam"        # dry run
 *   sudo docker-compose exec worker npx tsx scripts/remark.ts "Snatam" --go   # do it
 */
async function main() {
  const name = process.argv[2];
  const go = process.argv.includes("--go");
  if (!name || name.startsWith("--")) {
    console.log('Usage: npx tsx scripts/remark.ts "<client name>" [--go]');
    process.exit(1);
  }

  const projects = await db.project.findMany({
    where: { paymentHold: true, client: { name: { contains: name } } },
    include: { client: { select: { name: true } } },
  });
  if (projects.length === 0) {
    console.log(`No project on a payment hold for a client matching "${name}". Nothing to do.`);
    return;
  }

  let queued = 0;
  for (const p of projects) {
    const assets = await db.asset.findMany({
      where: { projectId: p.id, internal: false, markStatus: { in: ["READY", "FAILED"] } },
    });
    const busy = await db.asset.count({
      where: { projectId: p.id, internal: false, markStatus: { in: ["PENDING", "GENERATING"] } },
    });
    console.log(
      `${p.client.name} / ${p.title}: ${assets.length} to re-mark` +
        (busy ? `, ${busy} already being marked with the new seal` : "")
    );
    if (!go) continue;

    for (const a of assets) {
      for (const rel of [a.markedThumbRelPath, a.markedProxyRelPath, a.markedFileRelPath]) {
        if (rel) await rm(path.join(DERIVED_ROOT, rel), { force: true });
      }
      await db.asset.update({
        where: { id: a.id },
        data: {
          markStatus: "PENDING",
          markedThumbRelPath: null,
          markedProxyRelPath: null,
          markedFileRelPath: null,
        },
      });
      queued++;
    }
  }

  if (go) {
    await db.activity.create({
      data: { actor: "Staff", action: `re-watermarking ${queued} file(s) for ${name} with the BJUR seal` },
    });
    console.log(`\nQueued ${queued}. Watch: sudo docker logs -f bjur-portal-worker-1 | grep mark`);
  } else {
    console.log("\nDry run. Add --go to re-mark these.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
