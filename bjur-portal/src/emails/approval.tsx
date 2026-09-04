// Email #4 — approval request. Sent when an admin puts a post to the client, and again
// as a reminder 12 hours before it auto-approves.
//
// Plain HTML string with literal inline styles, same as delivery.tsx and onboarding.tsx:
// mail clients need real style="" attributes, and Next's bundler disallows
// react-dom/server imports from route-reachable modules.
//
// Tables rather than flexbox for the button row, per the handoff — Outlook's Word
// renderer drops display:flex entirely and would stack these on top of each other with
// no spacing.

export type ApprovalEmailProps = {
  clientName: string;
  recipientName: string;
  /** Post title as it will appear, falling back to the filename. */
  title: string;
  projectTitle: string;
  caption: string | null;
  platforms: string;
  /** Human-readable publish time, already formatted by the caller. */
  publishAtLabel: string;
  /** When it goes out anyway if nobody responds. Null when there is no deadline. */
  autoApproveLabel: string | null;
  approveUrl: string;
  holdUrl: string;
  projectUrl: string;
  isReminder: boolean;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderApprovalEmailHtml({
  clientName,
  recipientName,
  title,
  projectTitle,
  caption,
  platforms,
  publishAtLabel,
  autoApproveLabel,
  approveUrl,
  holdUrl,
  projectUrl,
  isReminder,
}: ApprovalEmailProps): string {
  const kicker = isReminder ? `Reminder · ${esc(clientName)}` : `Needs your OK · ${esc(clientName)}`;
  const headline = isReminder ? "Still waiting on you" : "One post needs your OK";
  const preheader = autoApproveLabel
    ? `${title} publishes ${esc(autoApproveLabel)} unless you hold it`
    : `${title} is waiting for your approval`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @media (max-width:480px) {
    .stack { display:block !important; width:100% !important; }
    .stack td { display:block !important; width:100% !important; }
    .btn { display:block !important; width:100% !important; margin-bottom:10px !important; }
  }
</style>
</head>
<body style="margin:0;background:#050506;font-family:Archivo,system-ui,sans-serif;-webkit-font-smoothing:antialiased">
<div style="background:#050506;padding:44px 20px">
  <div style="max-width:600px;margin:0 auto 14px;font-size:11px;letter-spacing:.04em;color:#4a4a4d">${preheader}</div>

  <div style="max-width:600px;margin:0 auto;background:#141416;border:1px solid #2a2a2e">
    <div style="height:3px;background:#ec3013"></div>

    <div style="padding:26px 40px;border-bottom:1px solid #2a2a2e">
      <span style="font-weight:900;font-size:16px;color:#f4f3f2">BJUR</span>
      <span style="font-weight:600;letter-spacing:.32em;font-size:12px;color:#8a8a8c">&nbsp;MEDIA</span>
    </div>

    <div style="padding:36px 40px 24px">
      <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#ec3013;font-weight:700;margin-bottom:14px">${kicker}</div>
      <h1 style="font-size:30px;line-height:1.1;letter-spacing:-.025em;font-weight:900;color:#f4f3f2;margin:0 0 14px">${esc(headline)}</h1>
      <p style="font-size:15px;line-height:1.65;color:#a9a8a7;margin:0">
        Hi ${esc(recipientName)} — this is scheduled to go out on your channels. Approve it, or hold it if it needs a change.
      </p>
    </div>

    <div style="padding:0 40px 8px">
      <div style="border:1px solid #2a2a2e;padding:20px">
        <div style="font-size:17px;font-weight:800;color:#f4f3f2;line-height:1.3">${esc(title)}</div>
        <div style="font-size:12px;color:#8a8a8c;margin-top:6px">${esc(projectTitle)} · ${esc(platforms)} · ${esc(publishAtLabel)}</div>
        ${
          caption
            ? `<div style="font-size:14px;line-height:1.6;color:#a9a8a7;margin-top:14px;padding-left:12px;border-left:2px solid #2a2a2e">${esc(
                caption.slice(0, 500)
              )}</div>`
            : `<div style="font-size:13px;color:#7d7c7a;margin-top:14px">No caption written yet.</div>`
        }
      </div>
    </div>

    ${
      autoApproveLabel
        ? `<div style="padding:18px 40px 0">
             <div style="background:#2a1310;border:1px solid #5a2418;padding:13px 16px;font-size:13px;line-height:1.55;color:#f0a595">
               If we don't hear from you it publishes <strong style="color:#ffb3a3">${esc(autoApproveLabel)}</strong>.
             </div>
           </div>`
        : ""
    }

    <div style="padding:24px 40px 8px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="stack" style="width:100%">
        <tr>
          <td style="padding-right:10px" class="btn">
            <a href="${approveUrl}" style="display:block;text-align:center;background:#ec3013;color:#0a0a0b;font-size:14px;font-weight:800;text-decoration:none;padding:14px 18px">Approve</a>
          </td>
          <td class="btn">
            <a href="${holdUrl}" style="display:block;text-align:center;background:#1c1c1f;border:1px solid #3a3a40;color:#ededec;font-size:14px;font-weight:700;text-decoration:none;padding:13px 18px">Hold it</a>
          </td>
        </tr>
      </table>
      <p style="font-size:12px;line-height:1.6;color:#7d7c7a;margin:14px 0 0">
        Both links ask you to confirm before anything happens. Prefer to look properly?
        <a href="${projectUrl}" style="color:#ff5233;text-decoration:none">Open the portal</a>.
      </p>
    </div>

    <div style="padding:26px 40px 32px">
      <div style="border-top:1px solid #2a2a2e;padding-top:16px;font-size:11px;line-height:1.6;color:#5f5c58">
        Sent by Bjur Media because you're the account owner for ${esc(clientName)}.
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}
