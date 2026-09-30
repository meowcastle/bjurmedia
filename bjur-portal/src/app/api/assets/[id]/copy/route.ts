import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectAccess } from "@/lib/projectAccess";
import { IG_CAPTION_MAX } from "@/lib/captionState";

const FIELDS = ["contentTitle", "caption", "captionYT"] as const;
type Field = (typeof FIELDS)[number];

/**
 * A reel's post copy, saved from the caption editor on either side of the portal.
 *
 * Any save makes the copy a person's (captionSource HUMAN) — editing already is the
 * read, so there is no second gesture to confirm it. `confirm` is that same move with no
 * change, for a draft someone read and had nothing to add to. `revert` undoes a confirm,
 * and only a confirm: if anything was saved after it, the undo would be throwing away
 * someone's words to restore a warning, so it is refused.
 *
 * captionApprovedAt stays staff-only. A client changing copy that staff already approved
 * clears the approval, so the week gate stops the edited version going out unread.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await db.asset.findUnique({ where: { id }, include: { project: true } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!session.isAdmin) {
    const access = await getProjectAccess(session, asset.project);
    if (!access.allowed || asset.internal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (asset.postedToSlackAt) return NextResponse.json({ error: "posted" }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const editedBy = session.isAdmin ? "ADMIN" : "CLIENT";

  if (body.revert === "AI") {
    // The confirm handed back its own timestamp. Anything saved since has moved it on.
    const since = typeof body.since === "string" ? body.since : null;
    if (!since || asset.captionEditedAt?.toISOString() !== since) {
      return NextResponse.json({ error: "changed" }, { status: 409 });
    }
    const prevAt = typeof body.prevEditedAt === "string" ? new Date(body.prevEditedAt) : null;
    const updated = await db.asset.update({
      where: { id },
      data: {
        captionSource: "AI",
        captionEditedBy: body.prevEditedBy === "CLIENT" || body.prevEditedBy === "ADMIN" ? body.prevEditedBy : null,
        captionEditedAt: prevAt && !Number.isNaN(prevAt.getTime()) ? prevAt : null,
      },
    });
    return NextResponse.json(result(updated));
  }

  const data: Partial<Record<Field, string | null>> = {};
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: `${f} must be text` }, { status: 400 });
    }
    data[f] = v?.trim() ? v.trim() : null;
  }
  if ((data.caption?.length ?? 0) > IG_CAPTION_MAX) {
    return NextResponse.json({ error: `Instagram captions stop at ${IG_CAPTION_MAX} characters.` }, { status: 422 });
  }
  if (Object.keys(data).length === 0 && body.confirm !== true) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  const changed = FIELDS.some((f) => f in data && data[f] !== asset[f]);

  const updated = await db.asset.update({
    where: { id },
    data: {
      ...data,
      captionSource: "HUMAN",
      captionEditedBy: editedBy,
      captionEditedAt: new Date(),
      ...(changed && editedBy === "CLIENT" && asset.captionApprovedAt ? { captionApprovedAt: null } : {}),
    },
  });

  return NextResponse.json(result(updated));
}

function result(a: {
  captionSource: string;
  captionEditedBy: string | null;
  captionEditedAt: Date | null;
}) {
  return {
    ok: true,
    captionSource: a.captionSource,
    captionEditedBy: a.captionEditedBy,
    captionEditedAt: a.captionEditedAt?.toISOString() ?? null,
  };
}
