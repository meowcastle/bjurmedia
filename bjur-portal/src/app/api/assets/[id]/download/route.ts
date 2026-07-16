import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { authorizeAssetAccess } from "@/lib/authz";
import { resolveMediaPath, streamFile } from "@/lib/media";
import { db } from "@/lib/db";
import { postSlackEvent } from "@/lib/slack";

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

  const filePath = await resolveMediaPath(auth.asset.relPath).catch(() => null);
  if (!filePath) return new Response(null, { status: 404 });

  let response: Response;
  try {
    response = streamFile(filePath, req.headers.get("range"), {
      download: auth.asset.name,
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
        data: { actor: project.client.name, action: `downloaded "${auth.asset.name}" from ${project.title}` },
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
