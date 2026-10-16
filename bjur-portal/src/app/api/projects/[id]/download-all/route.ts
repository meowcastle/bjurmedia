import path from "path";
import { stat } from "fs/promises";
import { NextRequest } from "next/server";
import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveDerivedPath, resolveMediaPath } from "@/lib/media";
import { postSlackEvent } from "@/lib/slack";
import { getProjectAccess } from "@/lib/projectAccess";
import { holdApplies, markedDownloadRelPath, markedReady } from "@/lib/paymentHold";
import { storedZipSize } from "@/lib/zipSize";

/** Same extension-swap as the single-file download: the marked copy is mp4/jpg. */
function markedZipName(assetName: string, markedPath: string) {
  const ext = path.extname(markedPath);
  const base = assetName.slice(0, assetName.length - path.extname(assetName).length);
  return `${base}${ext}`;
}

async function buildZipResponse(
  projectId: string,
  session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>,
  assetIds: string[] | null
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      assets: {
        where: { internal: false, ...(assetIds ? { id: { in: assetIds } } : {}) },
      },
      client: true,
    },
  });
  if (!project) return new Response(null, { status: 404 });
  const access = await getProjectAccess(session, project);
  if (!session.isAdmin) {
    if (!access.allowed) return new Response(null, { status: 404 });
    if (access.role === "VIEWER") return new Response(null, { status: 403 });
    if (project.expiresAt && project.expiresAt.getTime() < Date.now()) {
      return new Response(null, { status: 410 });
    }
  }

  // A held project zips its watermarked copies. Anything not marked yet is left out
  // rather than substituted with the master — a zip is the easiest place to leak the
  // whole gallery at once, so it fails closed, file by file.
  const watermark = holdApplies(project, session);
  const skipped: string[] = [];

  const entries: { path: string; name: string; size: number }[] = [];
  for (const asset of project.assets) {
    let relPath: string | null;
    let derived: boolean;
    if (watermark) {
      if (!markedReady(asset)) {
        skipped.push(asset.name);
        continue;
      }
      relPath = markedDownloadRelPath(asset);
      derived = true;
    } else {
      relPath = asset.relPath;
      derived = false;
    }

    if (!relPath) continue;
    const resolved = await (derived ? resolveDerivedPath(relPath) : resolveMediaPath(relPath)).catch(
      () => null
    );
    if (!resolved) continue;
    // The size on disk, not the row: Content-Length is computed from these, and a file
    // that is missing is left out here rather than failing halfway through the stream.
    const onDisk = await stat(resolved).catch(() => null);
    if (!onDisk?.isFile()) continue;
    const name = watermark ? markedZipName(asset.name, resolved) : asset.name;
    entries.push({ path: resolved, name: `${asset.format}/${name}`, size: onDisk.size });
  }

  if (watermark && skipped.length > 0) {
    console.warn(`[download-all] ${skipped.length} asset(s) not yet watermarked, omitted from zip`);
  }

  // Stored, not deflated. Video and photos are already compressed, so deflate saved
  // nothing and ran at ~3 MB/s — a multi-gigabyte zip trickled out for an hour and
  // phones gave up partway. Stored streams at disk speed and is the same size.
  // statConcurrency 1 keeps entries in the order they are added. With parallel stats the
  // order follows whichever finishes first, and past 4 GiB the order decides which
  // entries need zip64 extras — so the length below would no longer be exact.
  const archive = new ZipArchive({ store: true, statConcurrency: 1 });
  archive.on("warning", (err: Error) => console.warn("[download-all]", err));
  archive.on("error", (err: Error) => console.error("[download-all]", err));

  for (const entry of entries) {
    archive.file(entry.path, { name: entry.name });
  }
  archive.finalize();

  if (!session.isAdmin && entries.length > 0) {
    await db.activity.create({
      data: {
        actor: project.client.name,
        action: `downloaded ${entries.length} files from ${project.title}`,
      },
    });
    await postSlackEvent({
      clientId: project.clientId,
      toggle: "autoDownload",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:arrow_down: *${project.client.name}* downloaded ${entries.length} files from *${project.title}*`,
          },
        },
      ],
    });
  }

  const fileName = `${project.title.replace(/[^a-z0-9]+/gi, "-")}.zip`;

  return new Response(Readable.toWeb(archive as unknown as Readable) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      // Known in advance now that the zip is stored, so a phone shows real progress and
      // time remaining rather than an indefinite spinner.
      "Content-Length": String(storedZipSize(entries)),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  if (!session) return new Response(null, { status: 401 });
  return buildZipResponse(projectId, session, null);
}

/** Zips only the selected assets — used by the gallery's checkbox multi-select. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  if (!session) return new Response(null, { status: 401 });

  // The gallery submits a plain form so the browser saves the zip itself; JSON is
  // still accepted for scripted callers.
  const assetIds = req.headers.get("content-type")?.includes("application/json")
    ? ((await req.json().catch(() => ({}))) as { assetIds?: unknown }).assetIds
    : (await req.formData().catch(() => null))?.getAll("assetIds");
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return new Response(JSON.stringify({ error: "No files selected." }), { status: 400 });
  }

  return buildZipResponse(projectId, session, assetIds);
}
