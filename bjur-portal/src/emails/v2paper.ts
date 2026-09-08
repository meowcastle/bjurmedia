// The v2 "paper" card, for the review-loop emails.
//
// A second shell rather than a rewrite of shell.tsx: the v2 direction moves mail onto a
// light paper ground with a serif headline, and the four templates already in the dark
// style are working. Rewriting a live email to chase a look is how a client stops
// getting the one that mattered. The remaining templates move over in the theming pass;
// until then the two styles coexist, which nobody but us ever sees side by side.
//
// Same mail-client constraints as shell.tsx: tables, literal inline styles, solid hex
// borders, no web fonts (Georgia is the serif every client already has).

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'SF Mono',Menlo,Consolas,monospace";

export type PaperCta = { label: string; url: string };

export type PaperOptions = {
  preheader: string;
  kicker: string;
  headline: string;
  /** Client accent, drawn as the top rule and the kicker. */
  accent?: string;
  body?: string;
  /** Pulled-out block: a cut being sent, or a note that came back. */
  quote?: { title: string; text: string };
  /** Primary, then optional secondary. */
  cta?: PaperCta;
  cta2?: PaperCta;
  footnote?: string;
};

function button(cta: PaperCta, primary: boolean) {
  const bg = primary ? "#17161a" : "#f6f4f0";
  const fg = primary ? "#f6f4f0" : "#17161a";
  const border = primary ? "#17161a" : "#cfcbc3";
  return `<a href="${esc(cta.url)}" class="btn" style="display:inline-block;background:${bg};color:${fg};border:1px solid ${border};padding:13px 22px;font-family:${MONO};font-size:12px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none">${esc(cta.label)}</a>`;
}

export function renderPaper({
  preheader,
  kicker,
  headline,
  accent = "#17161a",
  body,
  quote,
  cta,
  cta2,
  footnote,
}: PaperOptions): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @media (max-width:480px) {
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .btn { display:block !important; text-align:center !important; margin-bottom:10px !important; }
  }
</style>
</head>
<body style="margin:0;background:#eeebe5;font-family:${MONO};-webkit-font-smoothing:antialiased">
<div style="background:#eeebe5;padding:44px 20px">
  <div style="max-width:600px;margin:0 auto 14px;font-size:11px;letter-spacing:.06em;color:#8a877f">${esc(preheader)}</div>

  <div style="max-width:600px;margin:0 auto;background:#f6f4f0;border:1px solid #dcd8d1">
    <div style="height:3px;background:${accent};font-size:0;line-height:0">&nbsp;</div>

    <div style="padding:24px 40px;border-bottom:1px solid #dcd8d1">
      <span style="font-family:${SERIF};font-size:17px;color:#17161a">Bjur</span>
      <span style="font-family:${MONO};letter-spacing:.28em;font-size:11px;color:#8a877f">&nbsp;MEDIA</span>
    </div>

    <div class="pad" style="padding:34px 40px 8px">
      <div style="font-family:${MONO};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${accent};margin-bottom:16px">${esc(kicker)}</div>
      <div style="font-family:${SERIF};font-size:30px;line-height:1.2;color:#17161a">${esc(headline)}</div>
      ${body ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.65;color:#4a4844">${esc(body)}</p>` : ""}
    </div>

    ${
      quote
        ? `<div class="pad" style="padding:22px 40px 0">
             <div style="border-left:2px solid ${accent};padding:2px 0 2px 16px">
               <div style="font-family:${MONO};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6e6b66;margin-bottom:7px">${esc(quote.title)}</div>
               <div style="font-family:${SERIF};font-size:16px;line-height:1.55;color:#17161a">${esc(quote.text)}</div>
             </div>
           </div>`
        : ""
    }

    ${
      cta
        ? `<div class="pad" style="padding:26px 40px 4px">
             ${button(cta, true)}${cta2 ? `&nbsp;&nbsp;${button(cta2, false)}` : ""}
           </div>`
        : ""
    }

    <div class="pad" style="padding:26px 40px 30px">
      ${footnote ? `<div style="border-top:1px solid #dcd8d1;padding-top:16px;font-size:11px;line-height:1.6;color:#8a877f">${esc(footnote)}</div>` : ""}
    </div>
  </div>
</div>
</body>
</html>`;
}
