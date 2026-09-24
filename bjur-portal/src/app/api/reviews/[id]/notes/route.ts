import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveReviewer, writableCut } from "@/lib/reviewAccess";

/**
 * Add a draft note to the current cut.
 *
 * Drafts are stored server-side rather than kept in the browser so they survive a reload
 * and follow the reviewer between devices — someone watches on a laptop, adds four notes,
 * and finishes on an iPad without losing them. They stay private to their author until
 * that author sends a batch.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await writableCut(id);
  if (!gate.ok) return new Response(null, { status: gate.status });

  const reviewer = await resolveReviewer(req, gate.cut.asset.projectId);
  if (!reviewer) return new Response(null, { status: 403 });

  const { timeSec, body } = await req.json().catch(() => ({}));
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return NextResponse.json({ error: "A note needs words." }, { status: 400 });

  const note = await db.reviewNote.create({
    data: {
      reviewId: id,
      reviewerId: reviewer.id,
      // Clamped and rounded to milliseconds: a float straight off currentTime carries
      // more precision than any edit can use, and a negative one is a seek race.
      timeSec: typeof timeSec === "number" && isFinite(timeSec) ? Math.max(0, Math.round(timeSec * 1000) / 1000) : null,
      body: text.slice(0, 2000),
    },
  });

  return NextResponse.json({ id: note.id });
}
