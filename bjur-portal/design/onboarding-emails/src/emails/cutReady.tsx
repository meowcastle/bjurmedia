// Cut ready: sent to every active reviewer, seats and guests, when the studio releases
// a cut. This is the portal's review request. Replaces reviewRequest.tsx.
//
// The notes are the point. A reviewer who left five notes on cut 1 opens this and sees
// all five, each with what was done about it, before they watch cut 2. That is the whole
// bargain of the loop: notes go one way, answers come back in the next cut's email. The
// v13 board shows only the tally in the facts; the full list stays under it, because an
// email without it would break that bargain silently.
//
// No deadline line, and no approve button. Approving happens on the review screen, by an
// owner, after watching.

import { renderShell, firstName, type ShellItem } from "@/emails/shell";

export type CutReadyNote = {
  /** "1:14", or "—" for a general note carried over from the old model. */
  time: string;
  body: string;
  author: string;
  /** What the studio did. Cut 1 has none of these. */
  outcome: "CHANGED" | "KEPT" | null;
  response: string | null;
};

export type CutReadyEmailProps = {
  clientName: string;
  /** Cut number being released. */
  version: number;
  /** Post title as it will read, falling back to the filename. */
  title: string;
  projectTitle: string;
  /** The studio's note alongside the cut. Optional. */
  note: string | null;
  /** Answered notes from the previous cut, in timeline order. Empty on cut 1. */
  notes: CutReadyNote[];
  /** Where this reviewer watches: a seat route, or a guest's tokenized link. */
  reviewUrl: string;
  /** Who this copy is for. Greets by first name when set. */
  recipientName?: string;
  /** "3:08", when the sender knows it. */
  length?: string | null;
  /** Absolute URL of the client's logo, when they have one. */
  logoUrl?: string | null;
  /** Kept for callers; v13 has one action colour, so it no longer tints anything. */
  accent?: string;
  /**
   * A seat that has never signed in. notifyCutReady issues a fresh temporary password
   * (the old one is hashed and cannot be re-sent) and the mail carries it, so the review
   * link is not a dead end at a login form they have no password for. Guests never get
   * this: their tokenized link is the whole of their access.
   */
  login?: { signInEmail: string; tempPassword: string; signInUrl: string };
  /**
   * Only owners see "Approve" on the review screen (reviewAccess.canApprove). Pass false
   * for everyone else so the mail does not offer a button they will not find. Undefined
   * keeps the old wording for callers not yet updated.
   */
  canApprove?: boolean;
};

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => (n <= 10 ? WORDS[n] : String(n));

/** "Your notes from cut 4 are answered inside: two changed, one kept as is." */
function answered(version: number, notes: CutReadyNote[]) {
  const changed = notes.filter((n) => n.outcome === "CHANGED").length;

  const kept = notes.length - changed;
  if (notes.length === 1) {
    return `Your note from cut ${version - 1} is answered inside: ${changed ? "changed" : "kept as is"}.`;
  }
  const verdict =
    kept === 0
      ? `all ${word(changed)} changed`
      : changed === 0
        ? `all ${word(kept)} kept as is`
        : `${word(changed)} changed, ${word(kept)} kept as is`;
  return `Your notes from cut ${version - 1} are answered inside: ${verdict}.`;
}

function toItem(n: CutReadyNote): ShellItem {
  return {
    label: `${n.time === "—" ? "General" : n.time} · ${n.author}`,
    body: n.body,
    tag: n.outcome ? (n.outcome === "CHANGED" ? "Changed" : "Kept as is") : undefined,
    // "Changed" with nothing written still has to say something, or the row reads as if
    // the note was ignored.
    reply: n.response || (n.outcome === "CHANGED" ? "Done." : undefined),
  };
}

export function renderCutReadyEmailHtml({
  clientName,
  version,
  title,
  projectTitle,
  note,
  notes,
  reviewUrl,
  recipientName,
  length,
  logoUrl,
  login,
  canApprove,
}: CutReadyEmailProps): string {
  const hi = recipientName ? `Hi ${firstName(recipientName)}. ` : "";
  // The headline already says which cut is up; the body only adds what it does not.
  const ask = `Leave ${version === 1 || notes.length === 0 ? "" : "new "}notes right on the video${
    canApprove === false ? "." : ", or approve it if it is good to go."
  }`;
  const summary = `${hi}${notes.length ? `${answered(version, notes)} ` : ""}${ask}`;

  const changed = notes.filter((n) => n.outcome === "CHANGED").length;

  // First time in: one line on why a password is here, and what happens to it.
  const loginLine = login ? "Your login is below. You choose your own password when you sign in." : null;
  const paragraphs = [summary, ...(note ? [note] : []), ...(loginLine ? [loginLine] : [])];

  return renderShell({
    preheader: `Cut ${version} of ${title} is ready to watch.`,
    logoUrl,
    kicker: `For your review · ${clientName}`,
    headline: `${title}, cut ${version} is ready for your notes.`,
    body: paragraphs.length === 1 ? paragraphs[0] : paragraphs,
    facts: [
      { label: "Project", value: projectTitle },
      ...(length ? [{ label: "Length", value: length }] : []),
      ...(notes.length
        ? [
            {
              label: `Notes from cut ${version - 1}`,
              value: `${changed} changed · ${notes.length - changed} kept`,
            },
          ]
        : []),
      ...(login
        ? [
            { label: "Sign in with", value: login.signInEmail },
            { label: "Temporary password", value: login.tempPassword, mono: true },
          ]
        : []),
    ],
    itemsTitle: notes.length ? `Your notes on cut ${version - 1}` : undefined,
    items: notes.length ? notes.map(toItem) : undefined,
    cta: login
      ? { label: `Sign in and review cut ${version}`, url: login.signInUrl }
      : { label: `Review cut ${version}`, url: reviewUrl },
    // First-login mail is followed by the review guide, which covers drafts; say it once.
    note: login ? undefined : "Only you see your notes until you press Send.",
  });
}
