// Email #5 — expiry reminder, at 14 days and 3 days before a gallery's expiresAt.
import { renderShell, button, factTable } from "@/emails/shell";

export type ExpiryEmailProps = {
  recipientName: string;
  projectTitle: string;
  clientName: string;
  expiresAtLabel: string;
  daysLeft: number;
  assetCount: number;
  totalSize: string;
  projectUrl: string;
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
}: ExpiryEmailProps): string {
  // Three days out is a different message from a fortnight out, and the colour says so
  // before the words do.
  const urgent = daysLeft <= 3;
  const accent = urgent ? "#ec3013" : "#e0a53c";

  const body = `
    <div class="pad" style="padding:0 40px 4px">
      <p style="font-size:15px;line-height:1.65;color:#a9a8a7;margin:0 0 20px">
        Hi ${recipientName} — downloads for ${projectTitle} stop working on
        ${expiresAtLabel}. Grab anything you still need before then; we keep the masters,
        so if you miss it just ask and we'll reopen it.
      </p>
      ${factTable([
        { label: "Project", value: projectTitle },
        { label: "Files", value: `${assetCount} · ${totalSize}` },
        { label: "Access ends", value: expiresAtLabel },
      ])}
    </div>
    <div class="pad" style="padding:24px 40px 0">
      ${button(projectUrl, `Download from ${projectTitle}`, accent)}
    </div>`;

  return renderShell({
    preheader: `${projectTitle} downloads close in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    kicker: urgent ? `Closing in ${daysLeft} days` : `${daysLeft} days left`,
    headline: urgent ? "Last chance to download" : "Your gallery closes soon",
    accent,
    body,
    footnote: `Sent to ${clientName} because you asked to be reminded before a gallery expires.`,
  });
}
