import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { inboxDirFor, ensureInboxDir } from "@/lib/projects";
import { ingestFile } from "@/lib/ingest";

export const runtime = "nodejs";

function sanitizeFilename(name: string) {
  const base = path.basename(name).trim(); // strip any directory components (path traversal)
  return base.replace(/[/\\]/g, "_") || "upload";
}

/**
 * Streams an admin-uploaded file into the project's existing inbox folder, then
 * ingests it directly in this same request/process instead of waiting on the
 * worker's chokidar watcher to notice it. In production, a file written by this
 * (web) container turned out not to reliably surface as an inotify event in the
 * separate worker container watching the same bind-mounted directory — one file
 * uploaded this way sat undetected through multiple full-tree rescans, while an
 * identical file placed directly on the NAS was picked up instantly. Calling the
 * same ingestFile() the watcher itself calls, synchronously and in-process here,
 * sidesteps that cross-container gap entirely rather than trying to make
 * cross-container file watching reliable.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await db.project.findUnique({ where: { id: projectId }, include: { client: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const filenameHeader = req.headers.get("x-filename");
  if (!filenameHeader) {
    return NextResponse.json({ error: "Missing X-Filename header." }, { status: 400 });
  }
  const filename = sanitizeFilename(decodeURIComponent(filenameHeader));

  if (!req.body) {
    return NextResponse.json({ error: "Empty request body." }, { status: 400 });
  }

  await ensureInboxDir(project.client.username, project.inboxSlug);
  const destPath = path.join(inboxDirFor(project.client.username, project.inboxSlug), filename);

  const nodeReadable = Readable.fromWeb(req.body as import("stream/web").ReadableStream<Uint8Array>);
  await pipeline(nodeReadable, createWriteStream(destPath));

  try {
    const asset = await ingestFile(destPath);
    if (!asset) {
      return NextResponse.json({
        ok: true,
        filename,
        ingested: false,
        note: "Uploaded, but not registered as an asset — check it's not a WIP file or an unrecognized format, and that this project's inbox folder matched correctly.",
      });
    }
    return NextResponse.json({ ok: true, filename, ingested: true, assetId: asset.id });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      filename,
      ingested: false,
      note: `Uploaded, but ingest failed: ${(err as Error).message.slice(0, 200)}`,
    });
  }
}
