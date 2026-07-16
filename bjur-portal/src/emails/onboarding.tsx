// Ported from prototypes/Client Onboarding Email.dc.html. Built as a plain HTML
// string (not JSX->render) — email clients need literal inline style="" attributes,
// and Next's bundler disallows react-dom/server imports from route-reachable modules.

export type OnboardingEmailProps = {
  clientName: string;
  recipientName: string;
  portalUrl: string;
  username: string;
  tempPassword: string;
  /** Omit for a plain seat/account welcome with no delivery attached yet. */
  delivery?: {
    projectTitle: string;
    reels: number;
    films: number;
    stills: number;
    braw: number;
    expiresAt: string | null;
  };
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statCell(value: number, label: string, accent: boolean, last: boolean) {
  return `
    <div style="flex:1;padding:18px 16px;${last ? "" : "border-right:1px solid rgba(255,255,255,.10);"}">
      <div style="font-size:26px;font-weight:900;color:${accent ? "#ec3013" : "#f4f3f2"};letter-spacing:-.02em">${value}</div>
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(244,243,242,.5);font-weight:600;margin-top:4px">${label}</div>
    </div>`;
}

function credRow(label: string, value: string, last: boolean) {
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:14px 16px;${last ? "" : "border-bottom:1px solid rgba(255,255,255,.10);"}">
      <span style="font-size:13px;color:rgba(244,243,242,.5)">${label}</span>
      <span style="font-size:13px;color:#f4f3f2;font-family:ui-monospace,Menlo,monospace">${esc(value)}</span>
    </div>`;
}

export function renderOnboardingEmailHtml({
  clientName,
  recipientName,
  portalUrl,
  username,
  tempPassword,
  delivery,
}: OnboardingEmailProps): string {
  const heroKicker = delivery ? `New delivery · ${esc(clientName)}` : `Welcome · ${esc(clientName)}`;
  const heroHeadline = delivery
    ? `Your ${esc(delivery.projectTitle)} deliverables are ready.`
    : "Your Bjur Media portal access is ready.";
  const heroBody = delivery
    ? `Hi ${esc(recipientName)} — your final photo and video deliverables are live in the Bjur Media delivery portal. Stream everything in-browser and download the masters at full resolution whenever you're ready.`
    : `Hi ${esc(recipientName)} — you now have access to the Bjur Media delivery portal for ${esc(clientName)}. Sign in below to view your deliverables as they're ready.`;

  const preheader = delivery
    ? `Your ${esc(delivery.projectTitle)} deliverables are ready to view and download.`
    : `Your Bjur Media portal login is ready.`;

  const statsBlock = delivery
    ? `
    <div style="padding:0 40px 30px">
      <div style="display:flex;border:1px solid rgba(255,255,255,.10)">
        ${statCell(delivery.reels, "Reels", false, false)}
        ${statCell(delivery.films, "Films", false, false)}
        ${statCell(delivery.stills, "Stills", false, false)}
        ${statCell(delivery.braw, "BRAW", true, true)}
      </div>
    </div>`
    : "";

  const expiryBlock =
    delivery?.expiresAt != null
      ? `
    <div style="padding:24px 40px;border-top:1px solid rgba(255,255,255,.10);background:#0f0f11">
      <div style="display:flex;gap:11px;align-items:flex-start">
        <div style="width:6px;height:6px;border-radius:50%;background:#ec3013;margin-top:6px;flex:none"></div>
        <p style="font-size:12px;line-height:1.6;color:rgba(244,243,242,.55);margin:0">This gallery is available until <strong style="color:#f4f3f2;font-weight:700">${esc(delivery.expiresAt)}</strong>. Please don't forward this email — your login is personal to you and gives access to your deliverables.</p>
      </div>
    </div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:#050506;font-family:Archivo,system-ui,sans-serif;-webkit-font-smoothing:antialiased">
<div style="background:#050506;padding:44px 20px;min-height:100vh">
  <div style="max-width:600px;margin:0 auto 14px;font-size:11px;letter-spacing:.04em;color:#4a4a4d">${preheader}</div>

  <div style="max-width:600px;margin:0 auto;background:#141416;border:1px solid rgba(255,255,255,.10)">
    <div style="height:3px;background:#ec3013"></div>

    <div style="padding:26px 40px;border-bottom:1px solid rgba(255,255,255,.10);display:flex;align-items:center;gap:11px">
      <div style="width:14px;height:14px;background:#ec3013"></div>
      <span style="font-weight:900;font-size:16px;color:#f4f3f2">BJUR</span>
      <span style="font-weight:600;letter-spacing:.32em;font-size:12px;color:rgba(244,243,242,.56)">MEDIA</span>
    </div>

    <div style="padding:40px 40px 30px">
      <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#ec3013;font-weight:700;margin-bottom:16px">${heroKicker}</div>
      <h1 style="font-size:34px;line-height:1.05;letter-spacing:-.025em;font-weight:900;color:#f4f3f2;margin:0 0 16px">${heroHeadline}</h1>
      <p style="font-size:15px;line-height:1.65;color:rgba(244,243,242,.62);margin:0">${heroBody}</p>
    </div>

    ${statsBlock}

    <div style="padding:0 40px 34px">
      <a href="${portalUrl}" style="display:block;text-align:center;background:#ec3013;color:#0a0a0b;font-weight:700;font-size:15px;padding:16px;letter-spacing:.01em;text-decoration:none">View your gallery →</a>
    </div>

    <div style="padding:0 40px 36px">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:rgba(244,243,242,.5);font-weight:700;margin-bottom:12px">Your sign-in</div>
      <div style="border:1px solid rgba(255,255,255,.10);background:#0a0a0b">
        ${credRow("Portal", portalUrl.replace(/^https?:\/\//, ""), false)}
        ${credRow("Username", username, false)}
        ${credRow("Temporary password", tempPassword, true)}
      </div>
      <p style="font-size:12px;line-height:1.6;color:rgba(244,243,242,.5);margin:12px 0 0">You'll be asked to set your own password on first sign-in. This temporary password expires in 7 days.</p>
    </div>

    ${expiryBlock}

    <div style="padding:26px 40px;border-top:1px solid rgba(255,255,255,.10)">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:12px">
        <div style="width:11px;height:11px;background:#ec3013"></div>
        <span style="font-weight:900;font-size:13px;color:#f4f3f2">BJUR</span>
        <span style="font-weight:600;letter-spacing:.3em;font-size:10px;color:rgba(244,243,242,.5)">MEDIA</span>
      </div>
      <p style="font-size:11px;line-height:1.7;color:rgba(244,243,242,.42);margin:0">Questions about your delivery? Reply to this email or reach us at <a href="mailto:hello@bjur.media" style="color:#ff5a3c">hello@bjur.media</a>.<br>Bjur Media · Video production · New York</p>
    </div>
  </div>

  <div style="max-width:600px;margin:16px auto 0;text-align:center;font-size:11px;color:#3a3a3d;line-height:1.6">Sent by Bjur Media delivery portal · self-hosted<br>You received this because a gallery was shared with your account.</div>
</div>
</body>
</html>`;
}
