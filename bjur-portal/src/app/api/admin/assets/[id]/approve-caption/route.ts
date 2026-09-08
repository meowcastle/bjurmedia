import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Staff signing off a caption, which is what lets its week go to Slack.
 *
 * The whole reason for the gate: captions can be drafted by the model, and drafting
 * them is meant to save typing, not to publish something nobody read.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await db.asset.findUnique({
    where: { id },
    select: { id: true, caption: true, captionYT: true, contentTitle: true, publishState: true },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hasCopy = Boolean(asset.caption?.trim() || asset.captionYT?.trim());
  if (!hasCopy) {
    return NextResponse.json({ error: "There's no caption to approve yet." }, { status: 400 });
  }

  await db.asset.update({
    where: { id },
    data: {
      captionApprovedAt: new Date(),
      // READY is "the week can go out". Anything already posted or published stays
      // where it is — approving a caption is not a way to walk a post backwards.
      publishState: ["POSTED", "PUBLISHED", "PUBLISHING"].includes(asset.publishState)
        ? asset.publishState
        : "READY",
    },
  });

  return NextResponse.json({ ok: true });
}

/** Un-approve, for a caption that turns out to need another pass. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await db.asset.findUnique({ where: { id }, select: { publishState: true } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (asset.publishState === "POSTED") {
    return NextResponse.json(
      { error: "That week is already in Slack — un-approving won't unsend it." },
      { status: 409 }
    );
  }

  await db.asset.update({
    where: { id },
    data: { captionApprovedAt: null, publishState: "DRAFT" },
  });
  return NextResponse.json({ ok: true });
}
