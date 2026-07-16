import { readdir, stat } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { MEDIA_ROOT, resolveMediaPath } from "@/lib/media";
import { classifyMedia } from "@/lib/ingest";

/**
 * Registers files already sitting under MEDIA_ROOT/<relDir> into a project, without
 * moving or copying them (ARCHITECTURE.md §2: registration never touches the source
 * tree). Distinct from the inbox auto-ingest flow, which stages and moves fresh exports.
 */
export async function registerFromNasPath(projectId: string, relDir: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const dirAbs = await resolveMediaPath(relDir);

  const entries = await readdir(dirAbs, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => path.join(dirAbs, e.name));

  const registered: string[] = [];
  const skipped: string[] = [];

  for (const filePath of files) {
    const relPath = path.relative(MEDIA_ROOT, filePath);

    const existing = await db.asset.findFirst({ where: { relPath } });
    if (existing) {
      skipped.push(relPath);
      continue;
    }

    let classification;
    try {
      classification = await classifyMedia(filePath);
    } catch {
      skipped.push(relPath);
      continue;
    }

    const sizeBytes = (await stat(filePath)).size;

    await db.asset.create({
      data: {
        projectId,
        kind: classification.kind,
        format: classification.format,
        orientation: classification.orientation,
        name: path.basename(filePath),
        relPath,
        sizeBytes: BigInt(sizeBytes),
        dims: classification.dims,
        durationSec: classification.durationSec,
        masterCodec: classification.masterCodec,
        proxyStatus: "PENDING",
      },
    });
    registered.push(relPath);
  }

  if (registered.length && project.status === "DRAFT") {
    await db.project.update({
      where: { id: projectId },
      data: { status: "LIVE", deliveredAt: new Date() },
    });
  }

  return { registered, skipped };
}
