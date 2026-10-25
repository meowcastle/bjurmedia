// Expiry reminder, at 14 days and 3 days before a project's expiresAt.
//
// Three days out is a different message from a fortnight out. v13 has one action colour,
// so the words carry the difference now: the kicker and headline change, the button
// does not.

import { renderShell, firstName } from "@/emails/shell";

export type ExpiryEmailProps = {
  recipientName: string;
  projectTitle: string;
  clientName: string;
  expiresAtLabel: string;
  daysLeft: number;
  assetCount: number;
  totalSize: string;
  projectUrl: string;
  /** Absolute URL of the client's logo, when they have one. */
  logoUrl?: string | null;
};

export function renderExpiryEmailHtml({
  recipientName,
  projectTitle,
  clientName,
  expiresAtLabel,
  daysLeft,
  assetCount,
  totalSize,
  projectUrl,
  logoUrl,
}: ExpiryEmailProps): string {
  const urgent = daysLeft <= 3;
  const days = `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;

  return renderShell({
    preheader: `${projectTitle} downloads close in ${days}.`,
    logoUrl,
    kicker: urgent ? `Closing in ${days} · ${clientName}` : `${days} left · ${clientName}`,
    headline: urgent ? "Last chance to download." : "Your project closes soon.",
    body: `Hi ${firstName(recipientName)}. Downloads for ${projectTitle} stop on ${expiresAtLabel}. Download anything you still need before then.`,
    facts: [
      { label: "Project", value: projectTitle },
      { label: "Files", value: `${assetCount} · ${totalSize}` },
      { label: "Access ends", value: expiresAtLabel },
    ],
    cta: { label: "Open project", url: projectUrl },
    note: "We keep the masters. If you miss the date, ask us and we will reopen it.",
    unsubscribe: `You are receiving this because expiry reminders are on for ${clientName}.`,
  });
}
