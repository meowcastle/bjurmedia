import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectAccess } from "@/lib/projectAccess";
import { respondToReview, reopenReview } from "@/lib/reviews";
import { notifyFeedback } from "@/lib/reviewMail";

/**
 * The client's answer on a cut: approve it, or send notes.
 *
 * Session-authenticated rather than token-signed, unlike the email approve/hold route.
 * The review email deep-links into the portal and the client answers there, so there is
 * no bare link for a mail scanner to fire — which is the whole reason that other route
 * had to grow a confirmation page.
 */
async function authorize(reviewId: string) {
  const session = await getSessionUser();
  if (!session || !session.clientId) return { error: "Unauthorized", status: 401 } as const;

  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { id: true, asset: { select: { project: true } } },
  });
  if (!review) return { error: "Not found", status: 404 } as const;

  const access = await getProjectAccess(session, review.asset.project);
  if (!access.allowed) return { error: "Not found", status: 404 } as const;

  return { session } as const;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const state = body?.state;
  if (state !== "APPROVED" && state !== "FEEDBACK") {
    return NextResponse.json({ error: "state must be APPROVED or FEEDBACK" }, { status: 400 });
  }
  const feedback = typeof body?.feedback === "string" ? body.feedback : null;
  if (state === "FEEDBACK" && !feedback?.trim()) {
    return NextResponse.json({ error: "Notes are required to send feedback" }, { status: 400 });
  }

  const result = await respondToReview(id, auth.session.id, { state, feedback });
  if (!result.ok) {
    // Someone on the same client already answered this round. Say so plainly rather
    // than failing silently — two seats answering at once is a normal thing to do.
    const status = result.error === "not-found" ? 404 : 409;
    const error =
      result.error === "already-answered"
        ? "Someone on your team already answered this one"
        : "Not found";
    return NextResponse.json({ error }, { status });
  }

  // Mail is best-effort: the client's answer is recorded either way, and a mailer
  // outage must not read to them as "my approval didn't go through".
  await notifyFeedback(id).catch(() => {});

  return NextResponse.json({ ok: true });
}

/** Undo, behind the client's 60s toast. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const undone = await reopenReview(id, auth.session.id);
  if (!undone) {
    return NextResponse.json({ error: "Too late to undo that" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
