// Email #6 — license receipt. Sent when a License row is created, whether the client
// bought it themselves or staff granted it.
import { renderShell, button, factTable } from "@/emails/shell";

export type LicenseEmailProps = {
  recipientName: string;
  clientName: string;
  assetName: string;
  tier: string;
  amount: number;
  scope: string;
  purchasedAtLabel: string;
  expiresAtLabel: string | null;
  /** True when staff granted it rather than the client buying it. */
  granted: boolean;
  assetUrl: string;
};

export function renderLicenseEmailHtml({
  recipientName,
  clientName,
  assetName,
  tier,
  amount,
  scope,
  purchasedAtLabel,
  expiresAtLabel,
  granted,
  assetUrl,
}: LicenseEmailProps): string {
  const body = `
    <div class="pad" style="padding:0 40px 4px">
      <p style="font-size:15px;line-height:1.65;color:#a9a8a7;margin:0 0 20px">
        Hi ${recipientName} — ${
          granted
            ? `we've licensed this master to ${clientName}. The download is unlocked in your portal.`
            : `here's your receipt. The master is unlocked and ready to download.`
        }
      </p>
      ${factTable(
        [
          { label: "File", value: assetName },
          { label: "License", value: tier },
          { label: "Scope", value: scope },
          { label: granted ? "Value" : "Amount", value: `$${amount.toLocaleString("en-US")}` },
          { label: "Issued", value: purchasedAtLabel },
          // Perpetual licences have no expiry, and printing "never" reads like an error.
          ...(expiresAtLabel ? [{ label: "Expires", value: expiresAtLabel }] : []),
        ].filter(Boolean) as { label: string; value: string }[]
      )}
    </div>
    <div class="pad" style="padding:24px 40px 0">
      ${button(assetUrl, "Download the master")}
    </div>`;

  return renderShell({
    preheader: `${assetName} — ${tier}${expiresAtLabel ? `, through ${expiresAtLabel}` : ", in perpetuity"}`,
    kicker: granted ? `License granted · ${clientName}` : `Receipt · ${clientName}`,
    headline: granted ? "A master has been licensed to you" : "Your license is confirmed",
    body,
    footnote: "Keep this email — it is the record of what you're licensed to use, and where.",
  });
}
