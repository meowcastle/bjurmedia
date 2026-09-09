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
//
// v2 paper. Georgia stands in for Source Serif 4: mail clients do not load web fonts,
// and Georgia is the one serif that is already on every machine that will open this.

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
<body style="margin:0;background:#eeebe5;font-family:'SF Mono',Menlo,Consolas,monospace;-webkit-font-smoothing:antialiased">
<div style="background:#eeebe5;padding:44px 20px">
  <div style="max-width:600px;margin:0 auto 14px;font-size:11px;letter-spacing:.06em;color:#8a877f">${esc(preheader)}</div>

  <div style="max-width:600px;margin:0 auto;background:#f6f4f0;border:1px solid #dcd8d1">
    <div style="height:3px;background:${accent};font-size:0;line-height:0">&nbsp;</div>

    <div class="pad" style="padding:24px 40px;border-bottom:1px solid #dcd8d1">
      <span style="font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#17161a">Bjur</span><span style="letter-spacing:.28em;font-size:11px;color:#8a877f">&nbsp;MEDIA</span>
    </div>

    <div class="pad" style="padding:34px 40px 22px">
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${accent};margin-bottom:16px">${esc(kicker)}</div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:400;color:#17161a;margin:0">${esc(headline)}</h1>
    </div>

    ${body}

    ${
      footnote
        ? `<div class="pad" style="padding:24px 40px 32px">
             <div style="border-top:1px solid #dcd8d1;padding-top:15px;font-size:11px;line-height:1.6;color:#8a877f">${esc(
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
export function button(href: string, label: string, accent = "#17161a") {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${accent}">
      <a href="${href}" style="display:block;padding:13px 24px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#f6f4f0;text-decoration:none">${esc(
        label
      )}</a>
    </td></tr></table>`;
}

/** Label/value rows. Used by anything that is mostly facts. */
export function factTable(facts: { label: string; value: string }[]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #dcd8d1">
    ${facts
      .map(
        (f) => `<tr>
          <td style="padding:11px 0;border-bottom:1px solid #dcd8d1;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6e6b66;width:40%;vertical-align:top">${esc(
            f.label
          )}</td>
          <td style="padding:11px 0;border-bottom:1px solid #dcd8d1;font-size:13px;color:#17161a">${esc(f.value)}</td>
        </tr>`
      )
      .join("")}
  </table>`;
}
