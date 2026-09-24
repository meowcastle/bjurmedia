import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

import { REVIEW_TOKEN_HEADER } from "@/lib/reviewToken";

export { REVIEW_TOKEN_HEADER };

/**
 * Who is asking, on a review route.
 *
 * Two kinds of caller and no third: a client seat with a session, or a guest holding a
 * token. Staff are deliberately *not* reviewers — an admin session resolves to null here,
 * because the studio answers notes through its own routes and must never be able to write
 * a note as somebody else.
 *
 * The token travels in a header rather than a cookie. A cookie would follow the guest
 * around the whole origin, and a guest link is meant to grant exactly one thing: this
 * project's review screen. A header is sent by the code that means to send it.
 */
export type Reviewer = Awaited<ReturnType<typeof db.reviewer.findFirst>>;

/**
 * Resolve the caller to a Reviewer row on this project, or null.
 *
 * Revoked reviewers resolve to null, which is what makes revoking a guest immediate:
 * their link keeps its shape and stops working.
 */
export async function resolveReviewer(
  req: NextRequest,
  projectId: string
): Promise<NonNullable<Reviewer> | null> {
  const token = req.headers.get(REVIEW_TOKEN_HEADER)?.trim();
  if (token) {
    const guest = await db.reviewer.findUnique({ where: { token } });
    if (!guest || guest.revokedAt || guest.projectId !== projectId) return null;
    return guest;
  }

  const session = await getSessionUser();
  if (!session || session.isAdmin) return null;

  const seat = await db.reviewer.findFirst({
    where: { projectId, userId: session.id, revokedAt: null },
  });
  return seat;
}

/**
 * Whether this reviewer may approve: an owner seat, and nothing else.
 *
 * Checked against ClientMember rather than anything stored on Reviewer, so that changing
 * someone's role on the client takes effect everywhere at once instead of leaving a stale
 * copy on every film they were ever invited to.
 */
export async function canApprove(reviewer: NonNullable<Reviewer>) {
  if (reviewer.kind !== "SEAT" || !reviewer.userId) return false;
  const project = await db.project.findUnique({
    where: { id: reviewer.projectId },
    select: { clientId: true },
  });
  if (!project) return false;
  const membership = await db.clientMember.findFirst({
    where: { clientId: project.clientId, userId: reviewer.userId },
    select: { role: true },
  });
  return membership?.role === "OWNER";
}

/**
 * The cut a note is allowed to land on: sent, current, not approved.
 *
 * Every write path checks this rather than trusting the id it was handed. A stale tab is
 * the ordinary case — someone leaves the screen open, a new cut goes out, and their next
 * note would otherwise attach to a round that closed hours ago.
 */
export async function writableCut(reviewId: string) {
  const cut = await db.review.findUnique({
    where: { id: reviewId },
    include: { asset: { select: { projectId: true } } },
  });
  if (!cut) return { ok: false as const, status: 404 };
  if (!cut.sentAt) return { ok: false as const, status: 409 };
  if (cut.state !== "PENDING") return { ok: false as const, status: 409 };
  return { ok: true as const, cut };
}
