// Delivery notification — the "new work is live" email, sent by the debounced
// batcher in src/lib/deliveryNotify.ts. Shares the visual language of
// onboarding.tsx (same prototype lineage) but deliberately carries no credentials:
// this goes to people who already have a login, and repeating a password in every
// delivery mail is exactly how one ends up forwarded.
//
// Plain HTML string, not JSX->render, for the same reasons as onboarding.tsx:
// email clients need literal inline style="" attributes, and Next's bundler
// disallows react-dom/server imports from route-reachable modules.

export type DeliveryEmailProps = {
  clientName: string;
  recipientName: string;
  projectTitle: string;
  /** Deep link to this project's gallery, e.g. https://portal…/p/<id> */
  projectUrl: string;
  counts: { reels: number; films: number; stills: number; braw: number };
  /** True when this batch replaced existing files rather than adding new ones. */
  isUpdate: boolean;
  expiresAt: string | null;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statCell(value: number, label: string, accent: boolean, last: boolean) {
  return `
    <div style="flex:1;padding:18px 16px;${last ? "" : "border-right:1px solid #dcd8d1;"}">
      <div style="font-size:26px;font-weight:900;color:${accent ? "#ec3013" : "#17161a"};letter-spacing:-.02em">${value}</div>
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6e6b66;font-weight:600;margin-top:4px">${label}</div>
    </div>`;
}

export function renderDeliveryEmailHtml({
  clientName,
  recipientName,
  projectTitle,
  projectUrl,
  counts,
  isUpdate,
  expiresAt,
}: DeliveryEmailProps): string {
  const kicker = isUpdate ? `Updated · ${esc(clientName)}` : `New delivery · ${esc(clientName)}`;
  const headline = isUpdate
    ? `${esc(projectTitle)} has been updated.`
    : `Your ${esc(projectTitle)} deliverables are ready.`;
  const body = isUpdate
    ? `Hi ${esc(recipientName)} — we've updated the files in ${esc(projectTitle)}. Everything below is live in your gallery now, at full resolution whenever you're ready.`
    : `Hi ${esc(recipientName)} — new work just landed in ${esc(projectTitle)}. Stream it in-browser and download the masters at full resolution whenever you're ready.`;
  const preheader = isUpdate
    ? `${esc(projectTitle)} has been updated in your Bjur Media gallery.`
    : `New work is live in your ${esc(projectTitle)} gallery.`;

  const expiryBlock =
    expiresAt != null
      ? `
    <div style="padding:24px 40px;border-top:1px solid #dcd8d1;background:#0f0f11">
      <div style="display:flex;gap:11px;align-items:flex-start">
        <div style="width:6px;height:6px;border-radius:50%;background:#ec3013;margin-top:6px;flex:none"></div>
        <p style="font-size:12px;line-height:1.6;color:#6e6b66;margin:0">This gallery is available until <strong style="color:#17161a;font-weight:700">${esc(expiresAt)}</strong>. Please don't forward this email — your login is personal to you and gives access to your deliverables.</p>
      </div>
    </div>`
      : "";

  // Only what actually landed. A delivery of three reels announcing "0 films, 0 stills,
  // 0 BRAW" is three lines of noise in someone's inbox, and it made the one real number
  // harder to find.
  const shownCounts = (
    [
      [counts.reels, "Reels", false],
      [counts.films, "Films", false],
      [counts.stills, "Stills", false],
      [counts.braw, "BRAW", true],
    ] as [number, string, boolean][]
  ).filter(([n]) => n > 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:#eeebe5;font-family:'SF Mono',Menlo,Consolas,monospace;-webkit-font-smoothing:antialiased">
<div style="background:#eeebe5;padding:44px 20px;min-height:100vh">
  <div style="max-width:600px;margin:0 auto 14px;font-size:11px;letter-spacing:.04em;color:#8a877f">${preheader}</div>

  <div style="max-width:600px;margin:0 auto;background:#f6f4f0;border:1px solid #dcd8d1">
    <div style="height:3px;background:#ec3013"></div>

    <div style="padding:26px 40px;border-bottom:1px solid #dcd8d1;display:flex;align-items:center;gap:11px">
      <div style="width:14px;height:14px;background:#ec3013"></div>
      <span style="font-weight:900;font-size:16px;color:#17161a">BJUR</span>
      <span style="font-weight:600;letter-spacing:.32em;font-size:12px;color:#6e6b66">MEDIA</span>
    </div>

    <div style="padding:40px 40px 30px">
      <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#ec3013;font-weight:700;margin-bottom:16px">${kicker}</div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.05;font-weight:400;color:#17161a;margin:0 0 16px">${headline}</h1>
      <p style="font-size:15px;line-height:1.65;color:#4a4844;margin:0">${body}</p>
    </div>

    <div style="padding:0 40px 30px">
      <div style="display:flex;border:1px solid #dcd8d1">
        ${shownCounts
          .map(([value, label, accent], i) =>
            statCell(value, label, accent, i === shownCounts.length - 1)
          )
          .join("")}
      </div>
    </div>

    <div style="padding:0 40px 34px">
      <a href="${projectUrl}" style="display:block;text-align:center;background:#17161a;color:#f6f4f0;font-size:12px;padding:16px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none">View your gallery →</a>
    </div>

    ${expiryBlock}

    <div style="padding:22px 40px;border-top:1px solid #dcd8d1;text-align:center">
      <p style="font-size:11px;line-height:1.6;color:#8a877f;margin:0">You're receiving this because delivery notifications are on for your Bjur Media account. Turn them off any time in your portal settings.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}
