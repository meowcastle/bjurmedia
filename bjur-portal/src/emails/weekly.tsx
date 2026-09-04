// Email #3 — weekly digest. Monday 08:00, to retainer clients with either new files
// delivered for the coming week or posts scheduled on their calendar.
import { renderShell, button, esc } from "@/emails/shell";

export type WeeklyDigestEmailProps = {
  clientName: string;
  recipientName: string;
  weekLabel: string;
  items: {
    title: string;
    projectTitle: string;
    /** Signed thumbnail URL — mail clients fetch without cookies. Null when none exists. */
    thumbUrl: string | null;
    /** "Tue Sep 8 · Instagram + YouTube", or "Delivered" for files with no post. */
    detail: string;
    state: string | null;
  }[];
  portalUrl: string;
};

export function renderWeeklyDigestEmailHtml({
  clientName,
  recipientName,
  weekLabel,
  items,
  portalUrl,
}: WeeklyDigestEmailProps): string {
  const rows = items
    .map(
      (item) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-bottom:1px solid #2a2a2e">
        <tr>
          <td style="width:76px;padding:14px 14px 14px 0;vertical-align:top">
            ${
              item.thumbUrl
                ? `<img src="${item.thumbUrl}" width="76" alt="" style="display:block;width:76px;height:auto;border:1px solid #2a2a2e">`
                : `<div style="width:76px;height:44px;background:#1c1c1f;border:1px solid #2a2a2e;font-size:0;line-height:0">&nbsp;</div>`
            }
          </td>
          <td style="padding:14px 0;vertical-align:top">
            <div style="font-size:15px;font-weight:700;color:#f4f3f2;line-height:1.3">${esc(item.title)}</div>
            <div style="font-size:12px;color:#8a8a8c;margin-top:4px">${esc(item.projectTitle)} · ${esc(item.detail)}</div>
          </td>
          ${
            item.state
              ? `<td style="padding:14px 0;vertical-align:top;text-align:right;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a9a8a7;white-space:nowrap">${esc(
                  item.state
                )}</td>`
              : "<td></td>"
          }
        </tr>
      </table>`
    )
    .join("");

  const body = `
    <div class="pad" style="padding:0 40px 4px">
      <p style="font-size:15px;line-height:1.65;color:#a9a8a7;margin:0 0 18px">
        Hi ${esc(recipientName)} — here's what's lined up for ${esc(weekLabel)}.
      </p>
      ${rows}
    </div>
    <div class="pad" style="padding:24px 40px 0">
      ${button(portalUrl, "Open the portal")}
    </div>`;

  return renderShell({
    preheader: `${items.length} item${items.length === 1 ? "" : "s"} for ${weekLabel}`,
    kicker: `This week · ${clientName}`,
    headline: `Your week of ${weekLabel}`,
    body,
    footnote: `Sent every Monday to ${clientName}. You can turn this off in your account settings.`,
  });
}
