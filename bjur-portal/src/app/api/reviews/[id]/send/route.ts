import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveReviewer, writableCut } from "@/lib/reviewAccess";
import { notifyNotesIn } from "@/lib/reviewMail";

/**
 * Send this reviewer's drafts on this cut. One press, one batch, one staff email.
 *
 * Only the caller's own drafts move. Two people drafting on the same cut are independent:
 * one sending must not push the other's half-written notes out from under them.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await writableCut(id);
  if (!gate.ok) return new Response(null, { status: gate.status });

  const reviewer = await resolveReviewer(req, gate.cut.asset.projectId);
  if (!reviewer) return new Response(null, { status: 403 });

  const drafts = await db.reviewNote.findMany({
    where: { reviewId: id, reviewerId: reviewer.id, sentAt: null },
    orderBy: [{ timeSec: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (drafts.length === 0) {
    return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  }

  const ids = drafts.map((d) => d.id);
  const sentAt = new Date();
  await db.reviewNote.updateMany({ where: { id: { in: ids } }, data: { sentAt } });

  await db.activity.create({
    data: {
      actor: reviewer.name,
      action: `sent ${ids.length} note${ids.length === 1 ? "" : "s"} on cut ${gate.cut.version}`,
    },
  });

  // After the write, and never allowed to undo it: a batch the studio did not get an
  // email about is still on the screen, whereas notes rolled back because a mail server
  // was down are gone with no way for the reviewer to know.
  await notifyNotesIn(id, reviewer.id, ids).catch(() => {});

  return NextResponse.json({ sent: ids.length });
}
