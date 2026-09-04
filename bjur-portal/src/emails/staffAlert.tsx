// Email #8 — staff alert. The things that need a person and would otherwise only ever
// appear in a Slack channel nobody was watching at the time: a publish that gave up
// after retries, an Instagram token about to expire, a client submission batch that
// finished uploading.
//
// Deliberately plainer than the client-facing templates. This goes to the studio, it is
// read on a phone at an awkward moment, and the only things that matter are what broke
// and where to go.

export type StaffAlertKind = "publish-failed" | "token-expiring" | "submission-complete";

export type StaffAlertEmailProps = {
  kind: StaffAlertKind;
  /** One line: what happened. */
  headline: string;
  /** Supporting facts, rendered as a definition list. */
  facts: { label: string; value: string }[];
  /** Error text or other verbatim detail, shown monospaced. Optional. */
  detail?: string | null;
  actionUrl: string;
  actionLabel: string;
};

const TONE: Record<StaffAlertKind, { kicker: string; rule: string }> = {
  "publish-failed": { kicker: "Publish failed", rule: "#ec3013" },
  "token-expiring": { kicker: "Action needed soon", rule: "#e0a53c" },
  "submission-complete": { kicker: "Upload complete", rule: "#5cc98d" },
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderStaffAlertEmailHtml({
  kind,
  headline,
  facts,
  detail,
  actionUrl,
  actionLabel,
}: StaffAlertEmailProps): string {
  const tone = TONE[kind];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:#050506;font-family:Archivo,system-ui,sans-serif;-webkit-font-smoothing:antialiased">
<div style="background:#050506;padding:44px 20px">
  <div style="max-width:600px;margin:0 auto 14px;font-size:11px;letter-spacing:.04em;color:#4a4a4d">${esc(headline)}</div>

  <div style="max-width:600px;margin:0 auto;background:#141416;border:1px solid #2a2a2e">
    <div style="height:3px;background:${tone.rule}"></div>

    <div style="padding:30px 36px 20px">
      <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${tone.rule};font-weight:700;margin-bottom:12px">${esc(tone.kicker)}</div>
      <h1 style="font-size:22px;line-height:1.25;letter-spacing:-.02em;font-weight:800;color:#f4f3f2;margin:0">${esc(headline)}</h1>
    </div>

    <div style="padding:0 36px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #2a2a2e">
        ${facts
          .map(
            (f) => `<tr>
              <td style="padding:11px 0;border-bottom:1px solid #2a2a2e;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7d7c7a;width:38%;vertical-align:top">${esc(
                f.label
              )}</td>
              <td style="padding:11px 0;border-bottom:1px solid #2a2a2e;font-size:14px;color:#ededec">${esc(f.value)}</td>
            </tr>`
          )
          .join("")}
      </table>
    </div>

    ${
      detail
        ? `<div style="padding:20px 36px 0">
             <div style="background:#0a0a0b;border:1px solid #2a2a2e;padding:13px 14px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.6;color:#a9a8a7;word-break:break-word">${esc(
               detail.slice(0, 600)
             )}</div>
           </div>`
        : ""
    }

    <div style="padding:24px 36px 34px">
      <a href="${actionUrl}" style="display:inline-block;background:#ec3013;color:#0a0a0b;font-size:14px;font-weight:800;text-decoration:none;padding:13px 22px">${esc(
        actionLabel
      )}</a>
    </div>
  </div>
</div>
</body>
</html>`;
}
