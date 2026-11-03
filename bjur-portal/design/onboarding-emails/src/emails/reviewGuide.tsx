// Review guide: how the feedback screen works. Sent once per reviewer, right after the
// first cut-ready mail they receive (Reviewer.guideSentAt). Seats and guests both — a
// guest director who has never seen the portal needs it most.
//
// Three steps, one per thing the review screen does that a first-timer cannot guess. Every label quoted here is the
// label on the review screen (ReviewScreen.tsx) — if one of those changes, change it
// here too, or the guide points at a button that is not there.
//
// No new markup: the steps ride in the shell's items list, the shortcuts in its detail
// box, so this reads as the same family as cut-ready.

import { renderShell, firstName } from "@/emails/shell";

export type ReviewGuideEmailProps = {
  clientName: string;
  recipientName?: string;
  projectTitle: string;
  /** Cut they are being sent to. Usually 1, but a reviewer added later starts mid-loop. */
  version: number;
  /** Same link as their cut-ready mail: seat route or guest token. */
  reviewUrl: string;
  /** Guests have no login; the copy says the link is theirs. */
  isGuest: boolean;
  /** Only owners see "Approve"; everyone else is told the owner signs off. */
  canApprove: boolean;
  logoUrl?: string | null;
};

export function renderReviewGuideEmailHtml({
  clientName,
  recipientName,
  projectTitle,
  version,
  reviewUrl,
  isGuest,
  canApprove,
  logoUrl,
}: ReviewGuideEmailProps): string {
  const hi = recipientName ? `Hi ${firstName(recipientName)}. ` : "";

  return renderShell({
    preheader: "Notes on the frame, sent together, answered in the next cut.",
    logoUrl,
    kicker: `How reviews work · ${clientName}`,
    headline: "Leaving notes on your cut takes a minute.",
    body: isGuest
      ? `${hi}No account needed: the link in your email is yours and works for every cut.`
      : `${hi}Three things to know before you open cut ${version}.`,
    items: [
      {
        label: "01 · Note the moment",
        body: "Pause and choose “Add a note at this moment”. It is pinned to that second. For the whole cut, leave a General note.",
      },
      {
        label: "02 · Send together",
        body: "Notes stay private (“Only you see these”) until you press “Send notes to Bjur”. They arrive as one batch.",
      },
      canApprove
        ? { label: "03 · Approve", body: `Nothing to change? Press “Approve cut ${version}”.` }
        : { label: "03 · Sign-off", body: "Your project owner approves the final cut." },
    ],
    detail: "Space play / pause  ·  N note here  ·  ← → one second  ·  M next note",
    cta: { label: `Open cut ${version}`, url: reviewUrl },
    note: "We answer every note in the next cut's email: changed, or kept as is and why.",
    unsubscribe: `You are receiving this once, because you were added as a reviewer on ${projectTitle}.`,
  });
}
