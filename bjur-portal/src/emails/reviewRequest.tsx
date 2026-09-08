// Review request — sent to owner seats when a new cut lands on a project with Review on.
//
// Deliberately has no deadline line. The flow this replaces auto-approved after a timer,
// which meant work could go out that the client had never opened; here silence just
// means nothing happens.

import { renderPaper } from "@/emails/v2paper";

export type ReviewRequestEmailProps = {
  clientName: string;
  /** "Cut 2", "Cut 1" — the round being asked about. */
  versionLabel: string;
  /** Post title as it will read, falling back to the filename. */
  title: string;
  projectTitle: string;
  /** The studio's note to the client. Optional; most cuts go out with one. */
  note: string | null;
  /** "Reel · uploaded today · 0:24" — what they are about to watch. */
  meta: string;
  projectUrl: string;
  accent?: string;
};

export function renderReviewRequestEmailHtml({
  clientName,
  versionLabel,
  title,
  projectTitle,
  note,
  meta,
  projectUrl,
  accent,
}: ReviewRequestEmailProps): string {
  return renderPaper({
    preheader: "Watch it, approve it, or send notes.",
    kicker: `For your review · ${clientName}`,
    headline: `${versionLabel} is ready.`,
    accent,
    body:
      note ??
      "A new cut is up in the portal. Approve it or send notes; both take a minute.",
    quote: { title: `${title} · ${projectTitle}`, text: meta },
    cta: { label: "Watch & approve", url: projectUrl },
    cta2: { label: "Send notes", url: projectUrl },
    footnote: `You're an owner for ${clientName}. Silence is fine — nothing moves without you.`,
  });
}
