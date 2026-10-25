// The one card every email sits in: client mail, staff alerts and CRM notes alike.
//
// v13 (design/v13/PortalEmails13). The bjur.nyc look carried into the inbox: paper
// ground, a 3px shu rule on the card, the seal beside "Client portal", an Archivo
// headline, mono labels, one shu button. Every template is a call to renderShell with
// its own words and none writes markup of its own, so the look cannot drift between
// emails again the way the v2 copies did.
//
// Mail-client constraints: tables and literal inline styles throughout. No flexbox, no
// CSS variables, no SVG (Gmail strips it, hence the hosted PNG seal), solid hex borders
// (some clients flatten rgba to black). Mail clients will not load Archivo or Plex Mono,
// so both stacks fall back to faces every machine already has. Light only: dark-mode
// inversion in mail clients is too uneven to design for.

export function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "Cansu Aydin" → "Cansu". The board greets by first name. */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

const SANS = "Archivo,'Helvetica Neue',Arial,sans-serif";
const MONO = "'IBM Plex Mono',Menlo,Consolas,monospace";

const PAPER = "#F4F1E8";
const CARD = "#FBF9F3";
const RULE = "#D9D3C4";
const INK = "#1A1A1A";
const SUMI = "#3A3934";
const ASH = "#7A776E";
const SHU = "#C8371F";

/** Hosted, never inline: the seal has to survive Gmail's image proxy. */
const SEAL_URL = "https://portal.bjur.nyc/email/seal.png";

const LABEL = `font-family:${MONO};font-size:11px;letter-spacing:.06em;text-transform:uppercase`;

export type ShellFact = {
  label: string;
  value: string;
  /** Set the value in mono too: a password, anything someone will have to type. */
  mono?: boolean;
};

/**
 * One entry in a list under the facts: a note on a cut, and what was done about it.
 * The cut-ready mail promises the answers travel with it, so the list survives the
 * board's simpler layout.
 */
export type ShellItem = {
  /** Mono line above, e.g. "1:14 · Adam". */
  label: string;
  body: string;
  /** Mono outcome, e.g. "Changed". */
  tag?: string;
  /** Sumi line under the tag: the studio's reply. */
  reply?: string;
};

export type ShellOptions = {
  /** Hidden line most clients show beside the subject in the inbox list. */
  preheader: string;
  /** The two mono lines beside the seal. "Client portal" over "portal.bjur.nyc" unless set. */
  masthead?: { title: string; sub: string };
  /** Absolute URL of the client's logo, shown round at 32px after a divider. */
  logoUrl?: string | null;
  /** Shu mono line above the headline: "Welcome · Suyin". */
  kicker?: string;
  headline?: string;
  /** One short line, ideally. An array renders as paragraphs (the CRM notes need that). */
  body?: string | string[];
  /** A still above the facts. Absolute URL. */
  image?: string | null;
  /** Optional mono caption inside the top of the facts table: "Your login". */
  factsTitle?: string;
  facts?: ShellFact[];
  itemsTitle?: string;
  items?: ShellItem[];
  /** Verbatim text (an error, say), shown in mono in a ruled box. */
  detail?: string | null;
  cta?: { label: string; url: string };
  /** The one grey practical line after the button. */
  note?: string;
  /** The footer's small print: why this arrived, and how to stop it where that applies. */
  unsubscribe?: string;
};

function header(masthead: { title: string; sub: string }, logoUrl?: string | null) {
  return `<tr><td class="px" style="padding:28px 40px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;width:40px"><img src="${SEAL_URL}" width="40" height="40" alt="BJUR" style="display:block;width:40px;height:40px;border:0"></td>
        <td style="padding-left:12px;vertical-align:middle;${LABEL};color:${INK};line-height:1.6">${esc(masthead.title)}<br><span style="color:${ASH}">${esc(masthead.sub)}</span></td>
        ${
          logoUrl
            ? `<td style="padding-left:12px;vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:1px solid ${RULE};padding-left:12px;vertical-align:middle"><img src="${esc(logoUrl)}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;border-radius:50%"></td></tr></table></td>`
            : ""
        }
      </tr></table>
    </td></tr>`;
}

function factsTable(facts: ShellFact[], title?: string) {
  const cell = `padding:12px 0;border-bottom:1px solid ${RULE}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${INK}">
      ${title ? `<tr><td colspan="2" style="padding:12px 0 6px;${LABEL};color:${ASH}">${esc(title)}</td></tr>` : ""}
      ${facts
        .map(
          (f) => `<tr>
        <td style="${cell};${LABEL};color:${ASH};width:40%;vertical-align:top">${esc(f.label)}</td>
        <td style="${cell};font-family:${SANS};font-size:15px;color:${INK};text-align:right;vertical-align:top">${
          f.mono
            ? `<span style="font-family:${MONO};font-size:14px;letter-spacing:.04em">${esc(f.value)}</span>`
            : esc(f.value)
        }</td>
      </tr>`
        )
        .join("")}
    </table>`;
}

function itemsList(items: ShellItem[], title?: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${INK}">
      ${title ? `<tr><td style="padding:12px 0 6px;${LABEL};color:${ASH}">${esc(title)}</td></tr>` : ""}
      ${items
        .map(
          (i) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${RULE}">
        <div style="${LABEL};color:${ASH}">${esc(i.label)}</div>
        <div style="margin-top:4px;font-family:${SANS};font-size:15px;line-height:1.5;color:${INK}">${esc(i.body)}</div>
        ${i.tag ? `<div style="margin-top:8px;${LABEL};color:${INK}">${esc(i.tag)}</div>` : ""}
        ${i.reply ? `<div style="margin-top:4px;font-family:${SANS};font-size:14px;line-height:1.5;color:${SUMI}">${esc(i.reply)}</div>` : ""}
      </td></tr>`
        )
        .join("")}
    </table>`;
}

/** The shu button. The fill sits on the cell, because Outlook ignores it on an <a>. */
function button(cta: { label: string; url: string }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="${SHU}" style="background:${SHU};border-radius:3px">
        <a href="${esc(cta.url)}" style="display:inline-block;padding:14px 22px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:3px">${esc(cta.label)} &rarr;</a>
      </td>
    </tr></table>`;
}

export function renderShell({
  preheader,
  masthead = { title: "Client portal", sub: "portal.bjur.nyc" },
  logoUrl,
  kicker,
  headline,
  body,
  image,
  factsTitle,
  facts,
  itemsTitle,
  items,
  detail,
  cta,
  note,
  unsubscribe,
}: ShellOptions): string {
  const paragraphs = body == null ? [] : Array.isArray(body) ? body : [body];

  // The first block under the header carries the board's 40px gap, whichever block that
  // turns out to be (a CRM note has no kicker or headline).
  let top = 40;
  const gap = () => {
    const t = top;
    top = 0;
    return t;
  };

  const rows: string[] = [];
  if (kicker) {
    rows.push(
      `<tr><td class="px" style="padding:${gap()}px 40px 8px;${LABEL};color:${SHU}">${esc(kicker)}</td></tr>`
    );
  }
  if (headline) {
    rows.push(
      `<tr><td class="px h1" style="padding:${gap()}px 40px 14px;font-family:${SANS};font-size:30px;line-height:1.08;font-weight:700;letter-spacing:-.03em;color:${INK}">${esc(headline)}</td></tr>`
    );
  }
  paragraphs.forEach((p, i) => {
    const last = i === paragraphs.length - 1;
    rows.push(
      `<tr><td class="px" style="padding:${gap()}px 40px ${last ? 28 : 14}px;font-family:${SANS};font-size:16px;line-height:1.55;color:${SUMI}">${esc(p).replace(/\n/g, "<br>")}</td></tr>`
    );
  });
  if (image) {
    rows.push(
      `<tr><td class="px" style="padding:${gap()}px 40px 28px"><img src="${esc(image)}" width="520" alt="" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid ${RULE}"></td></tr>`
    );
  }
  if (facts && facts.length) {
    rows.push(`<tr><td class="px" style="padding:${gap()}px 40px 28px">${factsTable(facts, factsTitle)}</td></tr>`);
  }
  if (items && items.length) {
    rows.push(`<tr><td class="px" style="padding:${gap()}px 40px 28px">${itemsList(items, itemsTitle)}</td></tr>`);
  }
  if (detail) {
    rows.push(
      `<tr><td class="px" style="padding:${gap()}px 40px 28px"><div style="border:1px solid ${RULE};padding:13px 14px;font-family:${MONO};font-size:12px;line-height:1.6;color:${SUMI};word-break:break-word">${esc(detail.slice(0, 600))}</div></td></tr>`
    );
  }
  if (cta) {
    rows.push(`<tr><td class="px" style="padding:${gap()}px 40px ${note ? 12 : 28}px">${button(cta)}</td></tr>`);
  }
  if (note) {
    rows.push(
      `<tr><td class="px" style="padding:${gap()}px 40px 28px;font-family:${SANS};font-size:14px;line-height:1.5;color:${ASH}">${esc(note)}</td></tr>`
    );
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<style>
  @media (max-width:480px) {
    .px { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:26px !important; }
    .outer { padding:20px 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER}"><tr><td class="outer" align="center" style="padding:44px 16px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="max-width:600px;width:100%;background:${CARD};border:1px solid ${RULE}">
    <tr><td style="height:3px;background:${SHU};font-size:0;line-height:0">&nbsp;</td></tr>
    ${header(masthead, logoUrl)}
    ${rows.join("\n    ")}
    <tr><td class="px" style="padding:22px 40px 26px;border-top:1px solid ${RULE}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="${LABEL};color:${ASH}">Bjur &middot; Brooklyn, NY</td>
        <td align="right" style="${LABEL};color:${ASH}"><a href="mailto:hi@bjur.nyc" style="color:${INK};text-decoration:none">hi@bjur.nyc</a></td>
      </tr></table>
      ${unsubscribe ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${ASH}">${esc(unsubscribe)}</p>` : ""}
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`;
}
