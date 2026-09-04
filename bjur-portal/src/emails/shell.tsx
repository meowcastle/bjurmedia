// The shared card every transactional email sits in.
//
// Extracted on the fourth template rather than the second: onboarding.tsx and
// delivery.tsx grew the same masthead, rule and card independently, and the copies had
// already drifted (one uses display:flex in the masthead, which Outlook's Word renderer
// drops entirely). New templates build on this; the two originals are left alone because
// rewriting a working email risks a regression nobody sees until a client complains.
//
// Tables and literal inline styles throughout — no flexbox, no CSS variables, no web
// fonts. Borders are solid hex rather than rgba, which some clients flatten to black.

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type ShellOptions = {
  /** Faint line above the card, shown by most clients in the inbox list preview. */
  preheader: string;
  /** Small coloured label above the headline. */
  kicker: string;
  headline: string;
  /** Colour of the 3px top rule and the kicker. */
  accent?: string;
  body: string;
  /** Optional closing line under a divider. */
  footnote?: string;
};

export function renderShell({
  preheader,
  kicker,
  headline,
  accent = "#ec3013",
  body,
  footnote,
}: ShellOptions): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @media (max-width:480px) {
    .stack, .stack tr, .stack td { display:block !important; width:100% !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
  }
</style>
</head>
<body style="margin:0;background:#050506;font-family:Archivo,system-ui,sans-serif;-webkit-font-smoothing:antialiased">
<div style="background:#050506;padding:44px 20px">
  <div style="max-width:600px;margin:0 auto 14px;font-size:11px;letter-spacing:.04em;color:#4a4a4d">${esc(preheader)}</div>

  <div style="max-width:600px;margin:0 auto;background:#141416;border:1px solid #2a2a2e">
    <div style="height:3px;background:${accent};font-size:0;line-height:0">&nbsp;</div>

    <div class="pad" style="padding:24px 40px;border-bottom:1px solid #2a2a2e">
      <span style="font-weight:900;font-size:16px;color:#f4f3f2">BJUR</span><span style="font-weight:600;letter-spacing:.32em;font-size:12px;color:#8a8a8c">&nbsp;MEDIA</span>
    </div>

    <div class="pad" style="padding:34px 40px 22px">
      <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${accent};font-weight:700;margin-bottom:13px">${esc(kicker)}</div>
      <h1 style="font-size:28px;line-height:1.12;letter-spacing:-.025em;font-weight:900;color:#f4f3f2;margin:0">${esc(headline)}</h1>
    </div>

    ${body}

    ${
      footnote
        ? `<div class="pad" style="padding:24px 40px 32px">
             <div style="border-top:1px solid #2a2a2e;padding-top:15px;font-size:11px;line-height:1.6;color:#5f5c58">${esc(
               footnote
             )}</div>
           </div>`
        : `<div style="height:28px;font-size:0;line-height:0">&nbsp;</div>`
    }
  </div>
</div>
</body>
</html>`;
}

/** A primary action button. A table cell, because Outlook ignores padding on an <a>. */
export function button(href: string, label: string, accent = "#ec3013") {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${accent}">
      <a href="${href}" style="display:block;padding:13px 24px;font-size:14px;font-weight:800;color:#0a0a0b;text-decoration:none">${esc(
        label
      )}</a>
    </td></tr></table>`;
}

/** Label/value rows. Used by anything that is mostly facts. */
export function factTable(facts: { label: string; value: string }[]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #2a2a2e">
    ${facts
      .map(
        (f) => `<tr>
          <td style="padding:11px 0;border-bottom:1px solid #2a2a2e;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7d7c7a;width:40%;vertical-align:top">${esc(
            f.label
          )}</td>
          <td style="padding:11px 0;border-bottom:1px solid #2a2a2e;font-size:14px;color:#ededec">${esc(f.value)}</td>
        </tr>`
      )
      .join("")}
  </table>`;
}
