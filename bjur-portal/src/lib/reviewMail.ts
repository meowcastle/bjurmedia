import { db } from "@/lib/db";
import { sendReviewRequestEmail, sendFeedbackReceivedEmail } from "@/lib/mailer";

/**
 * Mail for the review loop: the request out to the client, the answer back to us.
 *
 * Recipients come from ClientMember, not User.clientId. Since one person can hold seats
 * on several clients, User.clientId is only ever *one* of them — an owner of a second
 * client is invisible to a query on that column. ClientMember is the complete list.
 *
 * Neither function throws. A cut that is up but unannounced can be chased; a state
 * change rolled back because a mail server was down cannot be explained.
 */

function portalUrl() {
  return process.env.PORTAL_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

function clock(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function durationLabel(sec: number | null) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

export type ReviewMailDeps = {
  sendRequest: typeof sendReviewRequestEmail;
  sendFeedback: typeof sendFeedbackReceivedEmail;
};

/** Owner seats on a client, via the membership table. */
async function ownerSeats(clientId: string) {
  const members = await db.clientMember.findMany({
    where: { clientId, role: "OWNER", user: { deactivatedAt: null, isAdmin: false } },
    select: { user: { select: { email: true, name: true } } },
  });
  return members.map((m) => m.user);
}

/** "Go watch this" — sent when a round opens. */
export async function notifyReviewRequest(reviewId: string, deps: Partial<ReviewMailDeps> = {}) {
  const send = deps.sendRequest ?? sendReviewRequestEmail;
  try {
    const review = await db.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        version: true,
        note: true,
        state: true,
        asset: {
          select: {
            id: true,
            name: true,
            contentTitle: true,
            format: true,
            durationSec: true,
            project: {
              select: {
                id: true,
                title: true,
                clientId: true,
                client: { select: { name: true, accentColor: true } },
              },
            },
          },
        },
      },
    });
    if (!review) return { sent: 0 };
    // Don't chase a round somebody already answered — a slow queue shouldn't ask a
    // client to review something they've already signed off.
    if (review.state !== "PENDING") return { sent: 0 };

    const owners = await ownerSeats(review.asset.project.clientId);
    if (owners.length === 0) {
      console.warn(
        `[review-mail] ${review.asset.project.client.name} has no active owner seat to ask`
      );
      return { sent: 0 };
    }

    const dur = durationLabel(review.asset.durationSec);
    const meta = [review.asset.format, "in the portal, no download needed", dur]
      .filter(Boolean)
      .join(" · ");

    let sent = 0;
    for (const owner of owners) {
      await send(owner.email, {
        clientName: review.asset.project.client.name,
        versionLabel: `Cut ${review.version}`,
        title: review.asset.contentTitle || review.asset.name,
        projectTitle: review.asset.project.title,
        note: review.note,
        meta,
        projectUrl: `${portalUrl()}/p/${review.asset.project.id}`,
        accent: review.asset.project.client.accentColor ?? undefined,
      });
      sent += 1;
    }
    return { sent };
  } catch (err) {
    console.error("[review-mail] request failed:", (err as Error).message);
    return { sent: 0 };
  }
}

/** The answer coming back to the studio — notes, or a one-line approval. */
export async function notifyFeedback(reviewId: string, deps: Partial<ReviewMailDeps> = {}) {
  const send = deps.sendFeedback ?? sendFeedbackReceivedEmail;
  try {
    const review = await db.review.findUnique({
      where: { id: reviewId },
      select: {
        version: true,
        state: true,
        feedback: true,
        respondedAt: true,
        user: { select: { name: true, email: true } },
        asset: {
          select: {
            id: true,
            name: true,
            contentTitle: true,
            project: {
              select: {
                id: true,
                title: true,
                client: { select: { name: true, accentColor: true } },
              },
            },
          },
        },
      },
    });
    if (!review || review.state === "PENDING") return { sent: 0 };

    const staff = await db.user.findMany({
      where: { isAdmin: true, deactivatedAt: null },
      select: { email: true },
    });
    if (staff.length === 0) return { sent: 0 };

    const props = {
      clientName: review.asset.project.client.name,
      responderName: review.user?.name || review.user?.email || "A client seat",
      title: review.asset.contentTitle || review.asset.name,
      projectTitle: review.asset.project.title,
      versionLabel: `Cut ${review.version}`,
      approved: review.state === "APPROVED",
      feedback: review.feedback,
      timeLabel: clock(review.respondedAt ?? new Date()),
      assetUrl: `${portalUrl()}/p/${review.asset.project.id}`,
      accent: review.asset.project.client.accentColor ?? undefined,
    };

    let sent = 0;
    for (const person of staff) {
      await send(person.email, props);
      sent += 1;
    }
    return { sent };
  } catch (err) {
    console.error("[review-mail] feedback failed:", (err as Error).message);
    return { sent: 0 };
  }
}
