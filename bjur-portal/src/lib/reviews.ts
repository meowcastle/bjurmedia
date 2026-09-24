import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * The cut loop for FILM projects.
 *
 * A Review is one row per cut. The unit is the *version*, not the asset: a re-export
 * dropped over an existing file starts a new cut rather than reopening the old one, so a
 * note left on cut 1 is still readable after cut 2 lands. Ingest already counts
 * re-uploads — `reingestCount` is that version number, so the two can never disagree.
 *
 * The loop is deliberately one-directional. Reviewers leave timestamped notes and send
 * them in a batch; the studio answers every note from the previous cut and those answers
 * travel out in the next cut's email. Nothing is replied to inside the app — no threads,
 * no reactions, no second round of conversation on a note. An owner seat approves, and
 * that unlocks the master.
 *
 * There are no deadlines and nothing auto-approves. A cut sits PENDING until a person
 * acts on it.
 */

/** Version currently on disk for an asset. First upload is cut 1. */
function versionOf(reingestCount: number) {
  return reingestCount + 1;
}

/** Hex, not base64url: a hyphen inside a token broke a URL split once already. */
export function newGuestToken() {
  return randomBytes(32).toString("hex");
}

/**
 * Open a cut on an asset, if its project is a FILM project.
 *
 * Called at proxy-ready rather than at ingest, because there is nothing to watch until
 * the proxy exists.
 *
 * Created **unsent**. This is the change that makes the loop work: the old model mailed
 * the client the instant a file appeared, so a reviewer could be watching cut 2 and
 * leaving notes before the studio had answered a single note on cut 1. Now the cut waits
 * until the studio has answered the previous round and pressed send.
 *
 * Decides its own eligibility, like queueForCaptioning, so callers stay dumb. Idempotent
 * per version: the watcher can re-fire on the same file and still produce one cut.
 */
export async function openReview(assetId: string) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      internal: true,
      reingestCount: true,
      project: { select: { type: true } },
    },
  });
  if (!asset) return null;
  if (asset.project.type !== "FILM") return null;
  // Masters and working files are not cuts anyone is asked to sign off on.
  if (asset.internal) return null;

  const version = versionOf(asset.reingestCount);

  const existing = await db.review.findFirst({ where: { assetId, version } });
  if (existing) return existing;

  // No mail here, on purpose. Reviewers hear about a cut when the studio releases it.
  return db.review.create({ data: { assetId, version, state: "PENDING" } });
}

/**
 * The cut reviewers are currently looking at: sent, not yet superseded.
 *
 * Only one of these may exist per project at a time, which is what lets every other
 * question ("can I add a note?", "what am I answering?") be decided from one row.
 */
export async function currentCut(projectId: string) {
  return db.review.findFirst({
    where: {
      asset: { projectId },
      sentAt: { not: null },
      state: { in: ["PENDING", "APPROVED"] },
    },
    orderBy: { version: "desc" },
    include: { asset: true },
  });
}

/** A cut that has landed but has not gone out yet — what the studio owes an answer on. */
export async function unsentCut(projectId: string) {
  return db.review.findFirst({
    where: { asset: { projectId }, sentAt: null },
    orderBy: { version: "desc" },
    include: { asset: true },
  });
}

/**
 * Every note the studio must answer before the next cut can go out: sent notes on the
 * cut before this one. Drafts are excluded here as everywhere — they are not the
 * studio's business until their author sends them.
 */
export async function notesAwaitingAnswer(projectId: string) {
  const cut = await currentCut(projectId);
  if (!cut) return [];
  return db.reviewNote.findMany({
    where: { reviewId: cut.id, sentAt: { not: null } },
    orderBy: [{ timeSec: "asc" }, { createdAt: "asc" }],
    include: { reviewer: true },
  });
}

/**
 * Release an unsent cut to its reviewers.
 *
 * Refuses while any sent note on the previous cut is unanswered — that gate is the
 * feature. The email is a list of every note with what was done about it, so sending
 * before they are answered would produce a half-empty message and quietly break the
 * promise the loop makes to reviewers.
 */
export async function releaseCut(reviewId: string) {
  const cut = await db.review.findUnique({
    where: { id: reviewId },
    include: { asset: { select: { projectId: true } } },
  });
  if (!cut) return { ok: false as const, error: "not-found" as const };
  if (cut.sentAt) return { ok: false as const, error: "already-sent" as const };

  const previous = await currentCut(cut.asset.projectId);
  if (previous) {
    const unanswered = await db.reviewNote.count({
      where: { reviewId: previous.id, sentAt: { not: null }, outcome: null },
    });
    if (unanswered > 0) return { ok: false as const, error: "unanswered" as const, unanswered };
  }

  const now = new Date();
  await db.$transaction([
    ...(previous
      ? [
          db.review.update({
            where: { id: previous.id },
            data: { state: "SUPERSEDED", supersededAt: now },
          }),
        ]
      : []),
    db.review.update({ where: { id: cut.id }, data: { sentAt: now } }),
  ]);

  return { ok: true as const, previousId: previous?.id ?? null };
}

/**
 * Approve the current cut. Owner seats only — the caller proves that, not this function,
 * but it re-checks rather than trusting it, because approval is what unlocks the master.
 */
export async function approveCut(reviewId: string, reviewerId: string) {
  const reviewer = await db.reviewer.findUnique({
    where: { id: reviewerId },
    select: { id: true, kind: true, userId: true, projectId: true, revokedAt: true },
  });
  if (!reviewer || reviewer.revokedAt) return { ok: false as const, error: "not-a-reviewer" as const };
  if (reviewer.kind !== "SEAT" || !reviewer.userId) {
    return { ok: false as const, error: "not-an-owner" as const };
  }

  const project = await db.project.findUnique({
    where: { id: reviewer.projectId },
    select: { clientId: true },
  });
  const membership = project
    ? await db.clientMember.findFirst({
        where: { clientId: project.clientId, userId: reviewer.userId },
        select: { role: true },
      })
    : null;
  if (membership?.role !== "OWNER") return { ok: false as const, error: "not-an-owner" as const };

  // Whoever approves first wins; a second click cannot overwrite the record of who did it.
  const claimed = await db.review.updateMany({
    where: { id: reviewId, state: "PENDING", sentAt: { not: null } },
    data: { state: "APPROVED", approvedById: reviewerId, approvedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false as const, error: "not-open" as const };

  return { ok: true as const };
}

/**
 * Undo an approval, while it is still the latest cut.
 *
 * Once a newer cut has been sent the approval is history and reopening it would leave two
 * cuts claiming to be current.
 */
export async function unapproveCut(reviewId: string, reviewerId: string) {
  const claimed = await db.review.updateMany({
    where: { id: reviewId, state: "APPROVED", approvedById: reviewerId, supersededAt: null },
    data: { state: "PENDING", approvedById: null, approvedAt: null },
  });
  return claimed.count > 0;
}
