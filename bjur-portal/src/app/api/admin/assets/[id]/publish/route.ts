import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Action = "schedule" | "request-approval" | "approve" | "unschedule" | "release-hold";

/**
 * Staff side of the publish loop. Scheduling, sending a post to the client for sign-off,
 * and the overrides for when that goes sideways.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await db.asset.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      publishState: true,
      publishAt: true,
      publishIg: true,
      publishYt: true,
      project: { select: { clientId: true } },
    },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    action: Action;
    publishAt?: string | null;
    publishIg?: boolean;
    publishYt?: boolean;
    collaborators?: string[];
  };

  if (body.action === "schedule") {
    const at = body.publishAt ? new Date(body.publishAt) : null;
    if (body.publishAt && Number.isNaN(at!.getTime())) {
      return NextResponse.json({ error: "publishAt is not a date." }, { status: 400 });
    }
    const updated = await db.asset.update({
      where: { id },
      data: {
        publishAt: at,
        ...(body.publishIg !== undefined ? { publishIg: body.publishIg } : {}),
        ...(body.publishYt !== undefined ? { publishYt: body.publishYt } : {}),
        ...(body.collaborators !== undefined
          ? { collaborators: body.collaborators.length ? JSON.stringify(body.collaborators) : null }
          : {}),
        // Scheduling something that had nothing set makes it a draft. It does not
        // silently re-enter the approval loop, and it never overwrites a state the
        // worker owns.
        ...(asset.publishState === "NONE" && at ? { publishState: "DRAFT" as const } : {}),
      },
      select: { publishAt: true, publishIg: true, publishYt: true, publishState: true },
    });
    return NextResponse.json({ ok: true, ...updated });
  }

  if (body.action === "unschedule") {
    if (asset.publishState === "PUBLISHING" || asset.publishState === "PUBLISHED") {
      return NextResponse.json({ error: "This post has already gone out." }, { status: 409 });
    }
    const updated = await db.asset.update({
      where: { id },
      data: { publishAt: null, publishState: "NONE" },
      select: { publishState: true },
    });
    return NextResponse.json({ ok: true, ...updated });
  }

  if (body.action === "request-approval") {
    if (!asset.publishAt) {
      // Without a date the email cannot say when it goes out, and auto-approve has no
      // deadline to work back from.
      return NextResponse.json({ error: "Give the post a publish time first." }, { status: 400 });
    }
    if (!asset.publishIg && !asset.publishYt) {
      return NextResponse.json({ error: "Pick at least one platform first." }, { status: 400 });
    }
    if (asset.publishState === "PUBLISHING" || asset.publishState === "PUBLISHED") {
      return NextResponse.json({ error: "This post has already gone out." }, { status: 409 });
    }

    // AWAITING now means only "this is in the week that went to Slack". The client
    // approves there, with a reaction — there is no email to send, no deadline to meet
    // and nothing that approves itself if nobody answers.
    const updated = await db.asset.update({
      where: { id },
      data: {
        publishState: "AWAITING",
        approvedAt: null,
        approvedById: null,
      },
      select: { publishState: true },
    });

    return NextResponse.json({ ok: true, ...updated });
  }

  if (body.action === "approve" || body.action === "release-hold") {
    if (asset.publishState === "PUBLISHING" || asset.publishState === "PUBLISHED") {
      return NextResponse.json({ error: "This post has already gone out." }, { status: 409 });
    }
    const updated = await db.asset.update({
      where: { id },
      data: {
        publishState: "APPROVED",
        approvedById: session.id,
        approvedAt: new Date(),
      },
      select: { publishState: true },
    });
    return NextResponse.json({ ok: true, ...updated });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
