import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLOSED_STAGES, isStage } from "@/lib/crm/stages";

/**
 * Moves a deal or edits it. A stage change restarts the stall clock — stageChangedAt is
 * the whole engine of the follow-up agent — and clears its "already nudged" memory, since
 * a deal in a new stage is a new question.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const deal = await db.deal.findUnique({ where: { id } });
  if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.amount === null || (typeof body.amount === "number" && Number.isFinite(body.amount))) {
    data.amount = body.amount === null ? null : Math.round(body.amount as number);
  }
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (body.stage !== undefined) {
    if (!isStage(body.stage)) return NextResponse.json({ error: "Unknown stage." }, { status: 400 });
    if (body.stage !== deal.stage) {
      const now = new Date();
      data.stage = body.stage;
      data.stageChangedAt = now;
      data.lastNudgedAt = null;
      data.closedAt = CLOSED_STAGES.has(body.stage) ? now : null;
    }
  }
  const updated = await db.deal.update({ where: { id }, data });
  if (data.stage) {
    await db.activity.create({
      data: { actor: "You", action: `moved "${updated.title}" to ${String(data.stage).toLowerCase()}` },
    });
  }
  return NextResponse.json({ deal: { id: updated.id, stage: updated.stage } });
}
