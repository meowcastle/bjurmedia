import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { registerFromNasPath } from "@/lib/register";
import { postSlackEvent } from "@/lib/slack";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, path: relDir } = await req.json();
  if (typeof projectId !== "string" || typeof relDir !== "string" || !relDir.trim()) {
    return NextResponse.json({ error: "Project and NAS path are required." }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id: projectId }, include: { client: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let result;
  try {
    result = await registerFromNasPath(projectId, relDir.trim());
  } catch (err) {
    return NextResponse.json({ error: `Couldn't scan that path: ${(err as Error).message}` }, { status: 400 });
  }

  if (result.registered.length > 0) {
    await db.activity.create({
      data: {
        actor: "You",
        action: `registered ${result.registered.length} file(s) into ${project.title}`,
      },
    });
    await postSlackEvent({
      clientId: project.clientId,
      toggle: "autoUpload",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:package: *New delivery — ${project.client.name}*\n*${project.title}*\n${result.registered.length} file(s) registered from NAS`,
          },
        },
      ],
    });
  }

  return NextResponse.json(result);
}
