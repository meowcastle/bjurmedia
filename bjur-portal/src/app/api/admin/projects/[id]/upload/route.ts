import { createWriteStream } from "fs";
import { mkdir, rename, unlink } from "fs/promises";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { inboxDirFor, ensureInboxDir } from "@/lib/projects";
import { INBOX_ROOT } from "@/lib/media";

export const runtime = "nodejs";

const INGEST_URL = `http://worker:${process.env.INGEST_PORT ?? "3100"}/ingest`;

// Uploads land here first, invisible to the worker's chokidar watcher (see
// isFilesystemArtifact in worker.ts), and only get moved into the real inbox path
// once fully written — see the comment above the rename() call below for why.
const UPLOAD_STAGING_DIR = path.join(INBOX_ROOT, ".uploading");

function sanitizeFilename(name: string) {
  const base = path.basename(name).trim(); // strip any directory components (path traversal)
  return base.replace(/[/\\]/g, "_") || "upload";
}

/**
 * Streams an admin-uploaded file into the project's existing inbox folder, then asks
 * the worker container to ingest it — this container's media mount is read-only by
 * design (it only ever streams, never writes production media), so it can write the
 * upload into _inbox but can't itself move the finished file into MEDIA_ROOT. Calling
 * ingestFile() in-process here (an earlier version of this route) hit exactly that:
 * `ENOENT ... mkdir '/media/<client>/<project>'`, since the mkdir landed on a
 * read-only mount web was never granted write access to.
 *
 * Waiting on the worker's chokidar watcher to notice the file instead isn't reliable
 * either — in production a file written by web and watched by the separate worker
 * container didn't consistently surface as an inotify event (proven: one file sat
 * undetected through multiple full-tree rescans, while an identical file placed
 * directly on the NAS was picked up instantly). So: write to _inbox here, then make an
 * internal-only HTTP call to the worker container (which already holds the correct
 * permissions) to run the exact same ingestFile() the watcher itself uses.
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

  // Writing straight to destPath let the worker's chokidar watcher notice the file
  // before the upload actually finished: its awaitWriteFinish stability window (2.5s
  // of no size change) is tuned for fast NAS-local drops, but a browser upload
  // streamed over the admin's real internet connection can easily stall between
  // chunks for that long on a large clip. That fired ingestion on a truncated
  // snapshot — moveFile() copied whatever bytes existed at that instant into
  // MEDIA_ROOT and unlinked the inbox copy, while this still-open write stream kept
  // writing into the now-unlinked (orphaned) file, so the upload looked successful
  // here even though the asset that got created was corrupted. Staging the write
  // outside the watched tree and only rename()-ing (atomic, same mount) into place
  // once the whole file has landed means the watcher — and the /ingest call below —
  // never sees anything but a complete file.
  await mkdir(UPLOAD_STAGING_DIR, { recursive: true });
  const stagingPath = path.join(UPLOAD_STAGING_DIR, `${randomUUID()}-${filename}`);

  const nodeReadable = Readable.fromWeb(req.body as import("stream/web").ReadableStream<Uint8Array>);
  try {
    await pipeline(nodeReadable, createWriteStream(stagingPath));
  } catch (err) {
    await unlink(stagingPath).catch(() => {});
    return NextResponse.json(
      { error: `Upload failed: ${(err as Error).message.slice(0, 200)}` },
      { status: 500 }
    );
  }
  await rename(stagingPath, destPath);

  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ path: destPath }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({
        ok: true,
        filename,
        ingested: false,
        note: data.error ? `Uploaded, but ingest was rejected: ${data.error}` : `Uploaded, but ingest request failed (${res.status}).`,
      });
    }
    if (!data.ingested) {
      return NextResponse.json({
        ok: true,
        filename,
        ingested: false,
        note:
          data.note ??
          "Uploaded, but not registered as an asset — check it's not a WIP file or an unrecognized format, and that this project's inbox folder matched correctly.",
      });
    }
    return NextResponse.json({ ok: true, filename, ingested: true, assetId: data.assetId });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      filename,
      ingested: false,
      note: `Uploaded, but couldn't reach the ingest service: ${(err as Error).message.slice(0, 200)}`,
    });
  }
}
