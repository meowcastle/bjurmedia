import { NextRequest } from "next/server";
import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveDerivedPath, resolveMediaPath } from "@/lib/media";
import { postSlackEvent } from "@/lib/slack";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  if (!session) return new Response(null, { status: 401 });

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      assets: { where: { internal: false } },
      client: true,
    },
  });
  if (!project) return new Response(null, { status: 404 });
  if (!session.isAdmin) {
    if (project.clientId !== session.clientId) return new Response(null, { status: 404 });
    if (session.role === "VIEWER") return new Response(null, { status: 403 });
    if (project.expiresAt && project.expiresAt.getTime() < Date.now()) {
      return new Response(null, { status: 410 });
    }
  }

  const licenses = session.isAdmin
    ? []
    : await db.license.findMany({
        where: { clientId: session.clientId ?? undefined, assetId: { in: project.assets.map((a) => a.id) } },
      });
  const licensedAssetIds = new Set(licenses.map((l) => l.assetId));

  const entries: { path: string; name: string }[] = [];
  for (const asset of project.assets) {
    const useProxy = asset.licensable && !session.isAdmin && !licensedAssetIds.has(asset.id);
    const relPath = useProxy ? asset.proxyRelPath : asset.relPath;
    if (!relPath) continue;
    const resolved = await (useProxy ? resolveDerivedPath(relPath) : resolveMediaPath(relPath)).catch(
      () => null
    );
    if (!resolved) continue;
    entries.push({ path: resolved, name: `${asset.format}/${asset.name}` });
  }

  const archive = new ZipArchive({ zlib: { level: 6 } });
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
      "Cache-Control": "no-store",
    },
  });
}
