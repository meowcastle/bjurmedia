import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveReviewer, writableCut } from "@/lib/reviewAccess";

/** Edit or delete one's own draft. A sent note is immutable — it has already been read. */
async function ownDraft(req: NextRequest, reviewId: string, noteId: string) {
  const gate = await writableCut(reviewId);
  if (!gate.ok) return { error: gate.status };

  const reviewer = await resolveReviewer(req, gate.cut.asset.projectId);
  if (!reviewer) return { error: 403 };

  const note = await db.reviewNote.findUnique({ where: { id: noteId } });
  if (!note || note.reviewId !== reviewId) return { error: 404 };
  // Not "not yours" versus "already sent" — both are simply refused, because telling a
  // reviewer which one applies tells them about somebody else's note.
  if (note.reviewerId !== reviewer.id || note.sentAt) return { error: 403 };
  return { note };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
  const { body } = await req.json().catch(() => ({}));
  const found = await ownDraft(req, id, noteId);
  if ("error" in found) return new Response(null, { status: found.error });

  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return NextResponse.json({ error: "A note needs words." }, { status: 400 });

  await db.reviewNote.update({ where: { id: noteId }, data: { body: text.slice(0, 2000) } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
  const found = await ownDraft(req, id, noteId);
  if ("error" in found) return new Response(null, { status: found.error });

  await db.reviewNote.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}
