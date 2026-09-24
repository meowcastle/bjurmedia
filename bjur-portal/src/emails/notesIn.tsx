// Notes in — to the studio, once per batch a reviewer sends. Replaces feedbackReceived.tsx.
//
// One send is one email. A reviewer who watches twice and sends twice generates two of
// these, which is correct: each is a complete batch the studio can act on, and collapsing
// them would hide that the second lot arrived after the first was already being worked.
//
// The note bodies are quoted verbatim. Staff act on these without opening the app, so a
// summary would cost a round trip every time.

import { renderPaper } from "@/emails/v2paper";

export type NotesInEmailProps = {
  clientName: string;
  /** Who sent them, and their label if they have one ("Director"). */
  reviewerName: string;
  reviewerRole: string | null;
  version: number;
  title: string;
  projectTitle: string;
  /** Sent notes in this batch, timeline order. Empty when this is an approval. */
  notes: { time: string; body: string }[];
  /** True when the reviewer approved rather than sent notes. */
  approved: boolean;
  timeLabel: string;
  reviewUrl: string;
  accent?: string;
};

export function renderNotesInEmailHtml({
  clientName,
  reviewerName,
  reviewerRole,
  version,
  title,
  projectTitle,
  notes,
  approved,
  timeLabel,
  reviewUrl,
  accent,
}: NotesInEmailProps): string {
  const who = reviewerRole ? `${reviewerName} · ${reviewerRole}` : reviewerName;
  const headline = approved
    ? `${reviewerName} approved cut ${version}.`
    : `${reviewerName} sent ${notes.length} note${notes.length === 1 ? "" : "s"} on cut ${version}.`;

  return renderPaper({
    preheader: headline,
    kicker: `Notes · ${clientName}`,
    headline,
    accent,
    body: approved
      ? "Deliver the master from the project page. Nothing else is owed on this cut."
      : `Answer each one, then release the next cut. Reviewers see your answers in that email.`,
    quote: { title: `${title} · ${projectTitle}`, text: `${who} · ${timeLabel}` },
    rowsTitle: notes.length ? `Cut ${version}` : undefined,
    rows: notes.length ? notes.map((n) => ({ left: n.time, body: n.body })) : undefined,
    cta: { label: approved ? "Open project" : "Open review", url: reviewUrl },
  });
}
