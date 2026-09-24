import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * Answer one note: Changed or Kept as is, with the line reviewers will read.
 *
 * Sent notes only. A draft has no outcome to record because nobody has claimed it yet,
 * and reaching one from here would be the studio reading something private.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return new Response(null, { status: 403 });

  const { id, noteId } = await params;
  const { outcome, response } = await req.json().catch(() => ({}));
  if (outcome !== "CHANGED" && outcome !== "KEPT") {
    return NextResponse.json({ error: "Changed or kept." }, { status: 400 });
  }

  const text = typeof response === "string" ? response.trim() : "";
  // A note kept as it is needs a reason. It is the only thing the reviewer gets back, and
  // "kept" with nothing beside it reads as having been ignored.
  if (outcome === "KEPT" && !text) {
    return NextResponse.json({ error: "Say why it stays — reviewers read this." }, { status: 400 });
  }

  const updated = await db.reviewNote.updateMany({
    where: { id: noteId, reviewId: id, sentAt: { not: null } },
    data: { outcome, response: text || null, answeredAt: new Date() },
  });
  if (updated.count === 0) return new Response(null, { status: 404 });

  return NextResponse.json({ ok: true });
}
