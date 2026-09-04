import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/projectAccess";
import { db } from "@/lib/db";
import { postSlackEvent } from "@/lib/slack";
import { applyPostAction } from "@/lib/postActions";

type Action = "approve" | "hold" | "caption";

/**
 * §13. The client's side of the publish approval loop.
 *
 * Only OWNER acts here. A Downloader or Viewer seat can see that a post is waiting —
 * that context is useful — but clearing something to go out on the client's own
 * channels is an owner's decision, and the approval email is addressed to the owner.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const { id: projectId, assetId } = await params;
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, title: true, client: { select: { name: true } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getProjectAccess(session, project);
  if (!access.allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (access.role !== "OWNER") {
    return NextResponse.json({ error: "Only an owner can approve or hold a post." }, { status: 403 });
  }

  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      name: true,
      projectId: true,
      internal: true,
      publishState: true,
      publishAt: true,
      caption: true,
    },
  });
  // Scoped to the project in the URL rather than trusted from the asset: otherwise an
  // owner of one project could act on an asset id belonging to another client.
  if (!asset || asset.projectId !== projectId || asset.internal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { action, caption } = (await req.json()) as { action: Action; caption?: string };

  if (action === "approve" || action === "hold") {
    // Shared with the signed-link route the approval email points at, so the two cannot
    // drift into enforcing different rules.
    const result = await applyPostAction(assetId, action, { kind: "user", userId: session.id });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, publishState: result.state });
  }

  if (action === "caption") {
    if (typeof caption !== "string") {
      return NextResponse.json({ error: "caption must be a string." }, { status: 400 });
    }
    if (asset.publishState === "PUBLISHING" || asset.publishState === "PUBLISHED") {
      return NextResponse.json({ error: "This post has already gone out." }, { status: 409 });
    }
    const trimmed = caption.trim();
    await db.asset.update({ where: { id: assetId }, data: { caption: trimmed || null } });
    await db.activity.create({
      data: { actor: project.client.name, action: `edited the caption for "${asset.name}"` },
    });
    // The handoff asks for this explicitly: a caption the client rewrote is something
    // staff need to see before it goes out, not a silent change.
    await postSlackEvent({
      clientId: project.clientId,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:pencil2: *${project.client.name}* edited the caption for *${asset.name}*\n>${trimmed.slice(0, 280) || "_(cleared)_"}`,
          },
        },
      ],
    });
    return NextResponse.json({ ok: true, caption: trimmed || null });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
