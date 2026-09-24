// Cut ready — sent to every active reviewer, seats and guests, when the studio releases
// a cut. Replaces reviewRequest.tsx.
//
// The rows are the point. A reviewer who left five notes on cut 1 opens this and sees all
// five, each with what was done about it, before they watch cut 2. That is the whole
// bargain of the loop: notes go one way, answers come back in the next cut's email and
// nowhere else. An email without the rows would break it silently.
//
// No deadline line, and no approve button. Approving happens on the review screen, by an
// owner, after watching.

import { renderPaper, type PaperRow } from "@/emails/v2paper";

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
  accent?: string;
};

/** "Went through all 5 notes… 3 changed, 2 kept, with the reason below." */
function summary(version: number, notes: CutReadyNote[]) {
  if (notes.length === 0) {
    return version === 1
      ? "The first cut is up. Watch it, then approve or send notes."
      : "Watch it, then approve or send more notes.";
  }
  const names = [...new Set(notes.map((n) => n.author))];
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const changed = notes.filter((n) => n.outcome === "CHANGED").length;
  const kept = notes.length - changed;
  const verdict =
    kept === 0
      ? "Every one is changed."
      : changed === 0
        ? "All are kept as they are, with the reason below."
        : `${changed} changed, ${kept} kept, with the reason below.`;
  return `Went through all ${notes.length} note${notes.length === 1 ? "" : "s"} on cut ${
    version - 1
  } from ${who}. ${verdict} Watch it, then approve or send more notes.`;
}

function toRow(n: CutReadyNote): PaperRow {
  return {
    left: n.time,
    body: n.body,
    // "Changed" with nothing written still has to say something, or the row reads as if
    // the note was ignored.
    meta: [`by ${n.author}`, n.response || (n.outcome === "CHANGED" ? "Done." : null)]
      .filter(Boolean)
      .join(" · "),
    tag: n.outcome
      ? { label: n.outcome === "CHANGED" ? "Changed" : "Kept as is", tone: n.outcome === "CHANGED" ? "ok" : "mut" }
      : undefined,
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
  accent,
}: CutReadyEmailProps): string {
  return renderPaper({
    preheader: `Cut ${version} is ready to watch.`,
    kicker: `For your review · ${clientName}`,
    headline: `Cut ${version} is ready.`,
    accent,
    body: note ?? summary(version, notes),
    quote: { title: `${title} · ${projectTitle}`, text: `Cut ${version}` },
    rowsTitle: notes.length
      ? `${notes.length} note${notes.length === 1 ? "" : "s"} on cut ${version - 1}`
      : undefined,
    rows: notes.length ? notes.map(toRow) : undefined,
    cta: { label: `Watch cut ${version}`, url: reviewUrl },
    footnote:
      "Leave notes right on the video. They reach Bjur when you press send — not before.",
  });
}
