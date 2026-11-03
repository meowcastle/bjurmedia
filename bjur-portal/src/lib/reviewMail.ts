import { db } from "@/lib/db";
import { emailLogoUrl } from "@/lib/emailLogo";
import { sendCutReadyEmail, sendNotesInEmail, sendReviewGuideEmail } from "@/lib/mailer";
import { resetSeatPassword } from "@/lib/clients";
import { isLive } from "@/lib/deliveryNotify";
import { canApprove } from "@/lib/reviewAccess";
import type { CutReadyEmailProps, CutReadyNote } from "@/emails/cutReady";

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
  sendReviewGuide: typeof sendReviewGuideEmail;
  sendNotesIn: typeof sendNotesInEmail;
  issuePassword: typeof resetSeatPassword;
};

/**
 * A seat that has never signed in gets its login inside the cut-ready mail, or the review
 * link lands on a sign-in form they have no password for. The welcome mail may be long
 * gone and its password was temporary anyway, and passwords are hashed, so the only thing
 * to send is a fresh temporary one (resetSeatPassword, which also forces a change).
 *
 * Every cut, not just the first: each mail to a never-signed-in seat works on its own,
 * and the newest one in their inbox is always the one that works. Only when the mail
 * really goes out, though. A dry run that reset the password would leave the seat with
 * one nobody will ever see.
 */
async function firstLogin(
  reviewer: { kind: string; userId: string | null },
  projectId: string,
  version: number,
  issue: typeof resetSeatPassword
): Promise<CutReadyEmailProps["login"]> {
  if (reviewer.kind !== "SEAT" || !reviewer.userId) return undefined;
  const user = await db.user.findUnique({ where: { id: reviewer.userId } });
  if (!user || user.deactivatedAt || user.isAdmin || user.lastLoginAt != null) return undefined;

  if (!isLive()) {
    await db.activity.create({
      data: { actor: "Mailer", action: `(dry run) would include first-login details for ${user.email}` },
    });
    return undefined;
  }

  const { tempPassword } = await issue(user.id);
  await db.activity.create({
    data: { actor: "Mailer", action: `issued first-login password to ${user.email} with cut ${version}` },
  });
  return {
    signInEmail: user.email,
    tempPassword,
    signInUrl: `${portalUrl()}/login?next=${encodeURIComponent(`/p/${projectId}/review`)}`,
  };
}

/**
 * Where a given reviewer watches. Seats go through the portal with their session; a guest
 * has only their token, and that link is the entire extent of their access.
 */
export function watchUrl(
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
export async function notifyCutReady(
  reviewId: string,
  deps: Partial<ReviewMailDeps> = {},
  /** Just these reviewers — a guest added after the cut went out, catching up. */
  only?: string[]
) {
  const send = deps.sendCutReady ?? sendCutReadyEmail;
  const sendGuide = deps.sendReviewGuide ?? sendReviewGuideEmail;
  const issue = deps.issuePassword ?? resetSeatPassword;
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
              select: { id: true, title: true, client: { select: { name: true, accentColor: true, logoUrl: true } } },
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

    const reviewers = (await activeReviewers(projectId)).filter((r) => !only || only.includes(r.id));
    if (reviewers.length === 0) {
      console.warn(`[review-mail] ${cut.asset.project.title} has no active reviewer to tell`);
      return { sent: 0 };
    }

    const clientName = cut.asset.project.client.name;
    const logoUrl = emailLogoUrl(cut.asset.project.client.logoUrl);

    let sent = 0;
    let guides = 0;
    for (const reviewer of reviewers) {
      const reviewUrl = watchUrl(projectId, reviewer);
      const approves = await canApprove(reviewer);
      await send(reviewer.email, {
        clientName,
        logoUrl,
        version: cut.version,
        title: cut.asset.contentTitle || cut.asset.name,
        projectTitle: cut.asset.project.title,
        note: cut.note,
        notes,
        reviewUrl,
        recipientName: reviewer.name,
        accent: cut.asset.project.client.accentColor ?? undefined,
        login: await firstLogin(reviewer, projectId, cut.version, issue),
        canApprove: approves,
      });
      sent += 1;

      // The guide, once per reviewer, straight after the first cut they actually receive,
      // so the cut stays the newest thing in their inbox. Its own try: a guide that fails
      // is logged and the next reviewer still gets their cut.
      if (reviewer.guideSentAt == null) {
        try {
          if (!isLive()) {
            await db.activity.create({
              data: { actor: "Mailer", action: `(dry run) would send the review guide to ${reviewer.email}` },
            });
          } else {
            await sendGuide(reviewer.email, {
              clientName,
              logoUrl,
              recipientName: reviewer.name,
              projectTitle: cut.asset.project.title,
              version: cut.version,
              reviewUrl,
              isGuest: reviewer.kind === "GUEST",
              canApprove: approves,
            });
            await db.reviewer.update({ where: { id: reviewer.id }, data: { guideSentAt: new Date() } });
            guides += 1;
          }
        } catch (err) {
          await db.activity.create({
            data: { actor: "Mailer", action: `failed to send the review guide to ${reviewer.email}: ${(err as Error).message}` },
          });
        }
      }
    }
    return { sent, guides, notes: notes.length };
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
              select: { id: true, title: true, client: { select: { name: true, accentColor: true, logoUrl: true } } },
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
