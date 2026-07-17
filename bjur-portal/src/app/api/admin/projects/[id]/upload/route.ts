import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { inboxDirFor, ensureInboxDir } from "@/lib/projects";

export const runtime = "nodejs";

function sanitizeFilename(name: string) {
  const base = path.basename(name).trim(); // strip any directory components (path traversal)
  return base.replace(/[/\\]/g, "_") || "upload";
}

/**
 * Streams an admin-uploaded file straight into the project's existing inbox folder —
 * the exact same folder HandBrake/editors point at over the NAS share. The file then
 * flows through the normal chokidar watcher and ingestFile() pipeline (WIP filtering,
 * week-date parsing, Synology/SMB artifact filtering, all of it) with zero duplicate
 * logic here. This route only writes bytes to disk.
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

  return NextResponse.json({ ok: true, filename });
}
