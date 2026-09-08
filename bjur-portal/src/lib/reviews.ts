import { db } from "@/lib/db";
import { notifyReviewRequest } from "@/lib/reviewMail";

/**
 * The client-feedback loop for `project.review`.
 *
 * A review is one round on one cut. The unit is the *version*, not the asset: a
 * re-export dropped over an existing file starts a new round rather than reopening
 * the old one, so the note the client left on cut 1 is still readable after cut 2
 * lands. Ingest already counts re-uploads for us — `reingestCount` is that version
 * number, so the two can never disagree.
 *
 * There are no deadlines here and nothing auto-approves. The previous approval flow
 * had a timer that would clear work the client had never actually looked at; a cut
 * sits PENDING until a person answers.
 */

/** Version currently on disk for an asset. First upload is cut 1. */
function versionOf(reingestCount: number) {
  return reingestCount + 1;
}

/**
 * Open a round on an asset, if its project is a review project.
 *
 * Called at proxy-ready rather than at ingest, because the whole point of the email
 * is "go watch this" — before the proxy exists there is nothing to play, and a
 * client who clicks through to a dead frame does not come back a second time.
 *
 * Decides its own eligibility, like queueForCaptioning, so callers stay dumb and
 * nothing needs to know the rules in two places. Idempotent per version: the watcher
 * can re-fire on the same file and the client still sees one request.
 */
export async function openReview(assetId: string) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      internal: true,
      reingestCount: true,
      project: { select: { review: true } },
    },
  });
  if (!asset) return null;
  if (!asset.project.review) return null;
  // Masters and working files are not cuts anyone is asked to sign off on.
  if (asset.internal) return null;

  const version = versionOf(asset.reingestCount);

  const existing = await db.review.findFirst({ where: { assetId, version } });
  if (existing) return existing;

  const review = await db.review.create({ data: { assetId, version, state: "PENDING" } });

  // Mail is best-effort and deliberately after the row exists: a request nobody
  // received is visible in the portal and can be re-sent, whereas a row that failed to
  // write because the mailer was down would leave the client with an email pointing at
  // a cut the portal has no round for.
  await notifyReviewRequest(review.id).catch(() => {});

  return review;
}

export type ReviewResponse = { state: "APPROVED" | "FEEDBACK"; feedback?: string | null };

/**
 * Record a client's answer on the open round.
 *
 * Answers the *current* version only. If a new cut landed while the client had the
 * page open, their click applies to the round they were actually looking at and the
 * newer one stays pending — approving a cut you have not seen is the one outcome
 * this flow must never produce.
 */
export async function respondToReview(
  reviewId: string,
  userId: string,
  response: ReviewResponse
) {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { id: true, state: true },
  });
  if (!review) return { ok: false as const, error: "not-found" as const };

  // Conditional claim: whoever answers first wins, and a second click (or a second
  // seat on the same client) cannot overwrite a recorded answer.
  const claimed = await db.review.updateMany({
    where: { id: reviewId, state: "PENDING" },
    data: {
      state: response.state,
      feedback: response.state === "FEEDBACK" ? response.feedback?.trim() || null : null,
      userId,
      respondedAt: new Date(),
    },
  });
  if (claimed.count === 0) return { ok: false as const, error: "already-answered" as const };

  return { ok: true as const };
}

/** Undo, for the 60s window behind the client's toast. */
export async function reopenReview(reviewId: string, userId: string) {
  const claimed = await db.review.updateMany({
    // Only the person who answered can take it back, and only an answered round.
    where: { id: reviewId, userId, state: { in: ["APPROVED", "FEEDBACK"] } },
    data: { state: "PENDING", feedback: null, userId: null, respondedAt: null },
  });
  return claimed.count > 0;
}
