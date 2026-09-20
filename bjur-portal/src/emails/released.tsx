// The payment-release email — sent once, when staff turn a project's payment hold off.
//
// Its job is to close the loop on a specific promise: the client has been looking at
// watermarked files, they have paid, and the mark is now gone. So it leads with that
// rather than with "new work", which is delivery.tsx's job and would be wrong here —
// nothing new has landed, what changed is what they are allowed to take.
//
// Plain HTML string, not JSX->render, for the same reasons as delivery.tsx: email
// clients need literal inline style="" attributes, and Next's bundler disallows
// react-dom/server imports from route-reachable modules.

export type ReleasedEmailProps = {
  clientName: string;
  recipientName: string;
  projectTitle: string;
  /** Deep link to this project's gallery, e.g. https://portal…/p/<id> */
  projectUrl: string;
  /** How many client-visible files are now clean. */
  fileCount: number;
  expiresAt: string | null;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderReleasedEmailHtml({
  clientName,
  recipientName,
  projectTitle,
  projectUrl,
  fileCount,
  expiresAt,
}: ReleasedEmailProps): string {
  const preheader = `The watermarks are off — your ${esc(projectTitle)} files are ready to download.`;
  const plural = fileCount === 1 ? "file" : "files";

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
      <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#ec3013;font-weight:700;margin-bottom:16px">Thank you · ${esc(clientName)}</div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.05;font-weight:400;color:#17161a;margin:0 0 16px">Your ${esc(projectTitle)} files are ready.</h1>
      <p style="font-size:15px;line-height:1.65;color:#4a4844;margin:0 0 14px">Hi ${esc(recipientName)} — thank you for your purchase. The watermarks have been removed and all ${fileCount} ${plural} in ${esc(projectTitle)} are now yours to download at full quality.</p>
      <p style="font-size:15px;line-height:1.65;color:#4a4844;margin:0">Anything you already downloaded still carries the mark, so grab the finals fresh from the gallery. It's been a pleasure working with you.</p>
    </div>

    <div style="padding:0 40px 34px">
      <a href="${projectUrl}" style="display:block;text-align:center;background:#17161a;color:#f6f4f0;font-size:12px;padding:16px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none">Download your files →</a>
    </div>

    ${expiryBlock}

    <div style="padding:22px 40px;border-top:1px solid #dcd8d1;text-align:center">
      <p style="font-size:11px;line-height:1.6;color:#8a877f;margin:0">You're receiving this because you're an owner on this Bjur Media account and this project's files were just released to you.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}
