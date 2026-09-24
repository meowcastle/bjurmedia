import { db } from "@/lib/db";
import { sendCutReadyEmail, sendNotesInEmail } from "@/lib/mailer";
import type { CutReadyNote } from "@/emails/cutReady";

/**
 * Mail for the cut loop: a released cut out to every reviewer, a sent batch back to us.
 *
 * Recipients come from Reviewer, not ClientMember. A guest director has no account and no
 * membership row; asking the seat tables who to email would silently drop exactly the
 * people the guest link exists for. Reviewer is the complete list, seats and guests both,
 * and it is per project — someone reviewing one film for a client is not thereby reviewing
 * another.
 *
 * Neither function throws. A cut that is up but unannounced can be chased; a state change
 * rolled back because a mail server was down cannot be explained.
 */

function portalUrl() {
  return process.env.PORTAL_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

function clock(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

/** "1:14". A note with no time is one migrated from the old whole-cut feedback. */
export function timeLabel(sec: number | null) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export type ReviewMailDeps = {
  sendCutReady: typeof sendCutReadyEmail;
  sendNotesIn: typeof sendNotesInEmail;
};

/**
 * Where a given reviewer watches. Seats go through the portal with their session; a guest
 * has only their token, and that link is the entire extent of their access.
 */
function watchUrl(
  projectId: string,
  reviewer: { kind: string; token: string | null }
) {
  return reviewer.kind === "GUEST" && reviewer.token
    ? `${portalUrl()}/r/${reviewer.token}`
    : `${portalUrl()}/p/${projectId}/review`;
}

/** Everyone still entitled to watch: seats and guests, minus anyone revoked. */
async function activeReviewers(projectId: string) {
  return db.reviewer.findMany({
    where: { projectId, revokedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * "Cut n is ready" — one mail per active reviewer, each with their own link.
 *
 * Carries every sent note from the previous cut with what was done about it. Those
 * answers exist nowhere else in the client's world, so this send is the only time they
 * travel; a failure here is worth chasing rather than shrugging at.
 */
export async function notifyCutReady(reviewId: string, deps: Partial<ReviewMailDeps> = {}) {
  const send = deps.sendCutReady ?? sendCutReadyEmail;
  try {
    const cut = await db.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        version: true,
        note: true,
        asset: {
          select: {
            name: true,
            contentTitle: true,
            projectId: true,
            project: {
              select: { id: true, title: true, client: { select: { name: true, accentColor: true } } },
            },
          },
        },
      },
    });
    if (!cut) return { sent: 0 };

    const projectId = cut.asset.projectId;

    // The previous cut's answered notes. Drafts are excluded here as everywhere: an
    // unsent note is not part of the record and must never appear in anyone's mail.
    const previous = await db.review.findFirst({
      where: { asset: { projectId }, version: cut.version - 1 },
      select: { id: true },
    });
    const notes: CutReadyNote[] = previous
      ? (
          await db.reviewNote.findMany({
            where: { reviewId: previous.id, sentAt: { not: null } },
            orderBy: [{ timeSec: "asc" }, { createdAt: "asc" }],
            include: { reviewer: { select: { name: true } } },
          })
        ).map((n) => ({
          time: timeLabel(n.timeSec),
          body: n.body,
          author: n.reviewer.name,
          outcome: n.outcome,
          response: n.response,
        }))
      : [];

    const reviewers = await activeReviewers(projectId);
    if (reviewers.length === 0) {
      console.warn(`[review-mail] ${cut.asset.project.title} has no active reviewer to tell`);
      return { sent: 0 };
    }

    let sent = 0;
    for (const reviewer of reviewers) {
      await send(reviewer.email, {
        clientName: cut.asset.project.client.name,
        version: cut.version,
        title: cut.asset.contentTitle || cut.asset.name,
        projectTitle: cut.asset.project.title,
        note: cut.note,
        notes,
        reviewUrl: watchUrl(projectId, reviewer),
        accent: cut.asset.project.client.accentColor ?? undefined,
      });
      sent += 1;
    }
    return { sent, notes: notes.length };
  } catch (err) {
    console.error("[review-mail] cut-ready failed:", (err as Error).message);
    return { sent: 0 };
  }
}

/**
 * A batch of notes arriving, or an approval. To staff.
 *
 * Takes the note ids rather than reading whatever is sent on the cut, because a reviewer
 * may send twice: the second mail must contain the second batch, not both.
 */
export async function notifyNotesIn(
  reviewId: string,
  reviewerId: string,
  noteIds: string[],
  deps: Partial<ReviewMailDeps> = {}
) {
  const send = deps.sendNotesIn ?? sendNotesInEmail;
  try {
    const cut = await db.review.findUnique({
      where: { id: reviewId },
      select: {
        version: true,
        asset: {
          select: {
            name: true,
            contentTitle: true,
            projectId: true,
            project: {
              select: { id: true, title: true, client: { select: { name: true, accentColor: true } } },
            },
          },
        },
      },
    });
    const reviewer = await db.reviewer.findUnique({ where: { id: reviewerId } });
    if (!cut || !reviewer) return { sent: 0 };

    const staff = await db.user.findMany({
      where: { isAdmin: true, deactivatedAt: null },
      select: { email: true },
    });
    if (staff.length === 0) return { sent: 0 };

    const notes = noteIds.length
      ? (
          await db.reviewNote.findMany({
            where: { id: { in: noteIds }, sentAt: { not: null } },
            orderBy: [{ timeSec: "asc" }, { createdAt: "asc" }],
          })
        ).map((n) => ({ time: timeLabel(n.timeSec), body: n.body }))
      : [];

    const props = {
      clientName: cut.asset.project.client.name,
      reviewerName: reviewer.name,
      reviewerRole: reviewer.role,
      version: cut.version,
      title: cut.asset.contentTitle || cut.asset.name,
      projectTitle: cut.asset.project.title,
      notes,
      approved: noteIds.length === 0,
      timeLabel: clock(new Date()),
      reviewUrl: `${portalUrl()}/admin/projects/${cut.asset.projectId}/review`,
      accent: cut.asset.project.client.accentColor ?? undefined,
    };

    let sent = 0;
    for (const person of staff) {
      await send(person.email, props);
      sent += 1;
    }
    return { sent };
  } catch (err) {
    console.error("[review-mail] notes-in failed:", (err as Error).message);
    return { sent: 0 };
  }
}

/** An owner approved. Same template, different headline — it is still "news from a reviewer". */
export async function notifyApproved(
  reviewId: string,
  reviewerId: string,
  deps: Partial<ReviewMailDeps> = {}
) {
  return notifyNotesIn(reviewId, reviewerId, [], deps);
}
