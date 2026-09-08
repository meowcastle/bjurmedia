// Feedback received — to the studio, when a client answers a review.
//
// Approvals send too, as a one-liner with no quote block: knowing a cut cleared is the
// point, and a separate "approved" template would be the same email with less in it.

import { renderPaper } from "@/emails/v2paper";

export type FeedbackReceivedEmailProps = {
  clientName: string;
  /** Who answered. */
  responderName: string;
  title: string;
  projectTitle: string;
  versionLabel: string;
  approved: boolean;
  /** The client's note. Null on an approval. */
  feedback: string | null;
  /** Local time they answered, already formatted. */
  timeLabel: string;
  assetUrl: string;
  accent?: string;
};

export function renderFeedbackReceivedEmailHtml({
  clientName,
  responderName,
  title,
  projectTitle,
  versionLabel,
  approved,
  feedback,
  timeLabel,
  assetUrl,
  accent,
}: FeedbackReceivedEmailProps): string {
  const where = `${title} · ${versionLabel.toLowerCase()}`;

  return renderPaper({
    preheader: `${clientName} · ${where}`,
    kicker: `${approved ? "Approved" : "Feedback"} · ${clientName}`,
    headline: approved
      ? `${responderName} approved ${title}.`
      : `Notes on ${title}, ${versionLabel.toLowerCase()}.`,
    accent,
    body: approved ? `${versionLabel} is cleared in ${projectTitle}.` : undefined,
    quote: feedback ? { title: `${responderName} · ${timeLabel}`, text: feedback } : undefined,
    cta: { label: approved ? "Open project" : "Open reel", url: assetUrl },
  });
}
