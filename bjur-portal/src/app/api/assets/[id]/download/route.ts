import path from "path";
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { authorizeAssetAccess } from "@/lib/authz";
import { resolveDerivedPath, resolveMediaPath, streamFile } from "@/lib/media";
import { markedReady } from "@/lib/paymentHold";
import { db } from "@/lib/db";
import { postSlackEvent } from "@/lib/slack";

/** "A116_C002.mov" + a .mp4 marked copy -> "A116_C002.mp4". */
function markedDownloadName(assetName: string, markedPath: string) {
  const ext = path.extname(markedPath);
  const base = assetName.slice(0, assetName.length - path.extname(assetName).length);
  return `${base}${ext}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  const auth = await authorizeAssetAccess("download", id, session);
  if (!auth.ok) {
    if (auth.reason === "license_required") {
      return Response.json({ error: "A license is required to download this master." }, { status: 403 });
    }
    return new Response(null, { status: auth.status });
  }

  // Payment hold: hand over the watermarked full-quality copy in place of the master.
  // If it is not encoded yet, refuse — serving the master "just this once" because the
  // mark is still rendering would release exactly the file the hold exists to withhold.
  if (auth.watermark && !markedReady(auth.asset)) {
    return Response.json(
      {
        error:
          "This file is still being prepared for download. It will be ready shortly — try again in a few minutes.",
      },
      { status: 409 }
    );
  }

  const filePath = auth.watermark
    ? await resolveDerivedPath(auth.asset.markedFileRelPath!).catch(() => null)
    : await resolveMediaPath(auth.asset.relPath).catch(() => null);
  if (!filePath) return new Response(null, { status: 404 });

  let response: Response;
  try {
    response = streamFile(filePath, req.headers.get("range"), {
      // The marked copy is always H.264/mp4 (or jpg), which a ProRes .mov master is not —
      // keep the client's filename but give it the extension of what is actually inside,
      // or they get a .mov that no player will open.
      download: auth.watermark ? markedDownloadName(auth.asset.name, filePath) : auth.asset.name,
    });
  } catch {
    return new Response(null, { status: 404 });
  }

  // Fire-and-forget notification, and only for the initial request of a ranged
  // download (not every chunk a resumed download re-requests).
  if (!req.headers.get("range") && session && !session.isAdmin) {
    const project = await db.project.findUnique({
      where: { id: auth.asset.projectId },
      include: { client: true },
    });
    if (project) {
      await db.activity.create({
        data: {
          actor: project.client.name,
          action: `downloaded ${auth.watermark ? "a watermarked " : ""}"${auth.asset.name}" from ${project.title}`,
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
              text: `:arrow_down: *${project.client.name}* downloaded *${auth.asset.name}* from *${project.title}*`,
            },
          },
        ],
      });
    }
  }

  return response;
}
