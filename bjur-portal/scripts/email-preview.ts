/**
 * Every email template, rendered with sample data, for review before a deploy.
 *
 *   npx tsx scripts/email-preview.ts                  # write .email-preview/*.html
 *   npx tsx scripts/email-preview.ts --send you@x.com # also send each one, via the mailer
 *
 * Render mode touches nothing but .email-preview/ (gitignored). The local copies point
 * the seal at public/email/seal.png so they show before portal.bjur.nyc serves it; pass
 * --hosted to keep the real URL. Send mode goes through the same send* functions the app
 * uses, so it needs RESEND_API_KEY or SMTP_* in the environment, and it sends for real.
 * Sent copies carry no client logo unless EMAIL_PREVIEW_LOGO_URL names a public image.
 */
import fs from "node:fs";
import path from "node:path";
import { renderOnboardingEmailHtml, type OnboardingEmailProps } from "@/emails/onboarding";
import { renderDeliveryEmailHtml, type DeliveryEmailProps } from "@/emails/delivery";
import { renderCutReadyEmailHtml, type CutReadyEmailProps } from "@/emails/cutReady";
import { renderNotesInEmailHtml, type NotesInEmailProps } from "@/emails/notesIn";
import { renderReleasedEmailHtml, type ReleasedEmailProps } from "@/emails/released";
import { renderExpiryEmailHtml, type ExpiryEmailProps } from "@/emails/expiry";
import { renderStaffAlertEmailHtml, type StaffAlertEmailProps } from "@/emails/staffAlert";
import { renderOutreachEmailHtml } from "@/emails/outreach";

const OUT = path.join(process.cwd(), ".email-preview");
const SEAL_URL = "https://portal.bjur.nyc/email/seal.png";
const LOGO = "https://portal.bjur.nyc/email/sample-logo.png";
const PORTAL = "https://portal.bjur.nyc";

const welcome: OnboardingEmailProps = {
  clientName: "Suyin",
  recipientName: "Cansu Aydin",
  portalUrl: PORTAL,
  signInEmail: "cansu@suyinsama.com",
  tempPassword: "kite-paper-4471",
  logoUrl: LOGO,
};

const reset: OnboardingEmailProps = { ...welcome, tempPassword: "salt-river-0932", reason: "reset" };

const delivery: DeliveryEmailProps = {
  clientName: "Suyin",
  recipientName: "Cansu Aydin",
  projectTitle: "Gumi x Miku Hair",
  projectUrl: `${PORTAL}/p/gumi-x-miku-hair`,
  counts: { reels: 2, films: 1, stills: 1 },
  isUpdate: false,
  expiresAt: "Jan 19, 2027",
  totalSize: "2.1 GB",
  deliveredAt: "Oct 21, 2026",
  logoUrl: LOGO,
};

const cutReady: CutReadyEmailProps = {
  clientName: "Adam Knight",
  recipientName: "Adam Knight",
  version: 5,
  title: "Hurt",
  projectTitle: "Hurt · Color",
  note: null,
  length: "3:08",
  notes: [
    { time: "0:42", body: "Can the title hold a beat longer?", author: "Adam", outcome: "CHANGED", response: "Held for 12 frames more." },
    { time: "1:12", body: "Warmer on the close-up.", author: "Adam", outcome: "CHANGED", response: null },
    { time: "2:30", body: "Lose the crowd shot?", author: "Adam", outcome: "KEPT", response: "It carries the cut into the last chorus, so we kept it." },
  ],
  reviewUrl: `${PORTAL}/p/hurt/review`,
  logoUrl: LOGO,
};

const notesIn: NotesInEmailProps = {
  clientName: "Adam Knight",
  reviewerName: "Adam Knight",
  reviewerRole: "Artist",
  version: 5,
  title: "Hurt",
  projectTitle: "Hurt · Color",
  notes: [
    { time: "0:18", body: "Love the new open." },
    { time: "2:51", body: "Fade the last shot a touch sooner." },
  ],
  approved: false,
  timeLabel: "10:42 AM",
  reviewUrl: `${PORTAL}/admin/projects/hurt/review`,
};

const approved: NotesInEmailProps = { ...notesIn, notes: [], approved: true };

const released: ReleasedEmailProps = {
  clientName: "Snatam",
  recipientName: "Snatam Kaur",
  projectTitle: "Ong Namo Live",
  projectUrl: `${PORTAL}/p/ong-namo-live`,
  fileCount: 14,
  expiresAt: "Feb 2, 2027",
  logoUrl: LOGO,
};

const expiry: ExpiryEmailProps = {
  recipientName: "Marco Diaz",
  projectTitle: "HMU Fall Campaign",
  clientName: "HMU",
  expiresAtLabel: "Oct 28, 2026",
  daysLeft: 3,
  assetCount: 38,
  totalSize: "11.4 GB",
  projectUrl: `${PORTAL}/p/hmu-fall`,
  logoUrl: LOGO,
};

const staffAlert: StaffAlertEmailProps = {
  kind: "publish-failed",
  headline: "Instagram publish failed for THE SSH",
  facts: [
    { label: "Post", value: "Rooftop session, reel 2" },
    { label: "Scheduled", value: "Oct 25, 2026 · 6:00 PM" },
    { label: "Attempts", value: "3" },
  ],
  detail: "OAuthException: (#10) Application does not have permission for this action",
  actionUrl: `${PORTAL}/admin/social`,
  actionLabel: "Open in the portal",
};

const outreach = {
  subject: "Checking in on the HMU quote",
  body: "Hi Marco,\n\nWanted to check in on the quote we sent over for the fall campaign. Happy to adjust the scope if the timing has moved.\n\nTalk soon,\nJustin",
};

/** The sample logo only exists locally, so a sent copy swaps in a real URL or none. */
const sendable = <T extends { logoUrl?: string | null }>(p: T): T => ({
  ...p,
  logoUrl: process.env.EMAIL_PREVIEW_LOGO_URL || null,
});

/** Name, subject as the mailer sets it, the HTML, and how to send it for real. */
type Preview = {
  name: string;
  subject: string;
  html: string;
  send: (to: string, m: typeof import("@/lib/mailer")) => Promise<unknown>;
};

const previews: Preview[] = [
  { name: "welcome", subject: "Your portal login is ready", html: renderOnboardingEmailHtml(welcome), send: (to, m) => m.sendOnboardingEmail(to, sendable(welcome)) },
  { name: "password-reset", subject: "Your portal password has been reset", html: renderOnboardingEmailHtml(reset), send: (to, m) => m.sendOnboardingEmail(to, sendable(reset)) },
  { name: "delivery", subject: `Your ${delivery.projectTitle} files are ready`, html: renderDeliveryEmailHtml(delivery), send: (to, m) => m.sendDeliveryEmail(to, sendable(delivery)) },
  { name: "delivery-update", subject: `${delivery.projectTitle} has been updated`, html: renderDeliveryEmailHtml({ ...delivery, isUpdate: true }), send: (to, m) => m.sendDeliveryEmail(to, sendable({ ...delivery, isUpdate: true })) },
  { name: "cut-ready", subject: `${cutReady.title} · cut ${cutReady.version} is ready`, html: renderCutReadyEmailHtml(cutReady), send: (to, m) => m.sendCutReadyEmail(to, sendable(cutReady)) },
  { name: "notes-in", subject: `[Bjur] ${notesIn.reviewerName} sent 2 notes on Hurt · cut 5`, html: renderNotesInEmailHtml(notesIn), send: (to, m) => m.sendNotesInEmail(to, notesIn) },
  { name: "approved", subject: `[Bjur] ${approved.reviewerName} approved Hurt · cut 5`, html: renderNotesInEmailHtml(approved), send: (to, m) => m.sendNotesInEmail(to, approved) },
  { name: "released", subject: `Your ${released.projectTitle} files are ready`, html: renderReleasedEmailHtml(released), send: (to, m) => m.sendReleasedEmail(to, sendable(released)) },
  { name: "expiry", subject: `Last chance: ${expiry.projectTitle} closes in 3 days`, html: renderExpiryEmailHtml(expiry), send: (to, m) => m.sendExpiryEmail(to, sendable(expiry)) },
  { name: "staff-alert", subject: `[Bjur] ${staffAlert.headline}`, html: renderStaffAlertEmailHtml(staffAlert), send: (to, m) => m.sendStaffAlertEmail(to, staffAlert) },
  { name: "outreach", subject: outreach.subject, html: renderOutreachEmailHtml(outreach.subject, outreach.body), send: (to, m) => m.sendOutreachEmail(to, outreach.subject, outreach.body) },
];

async function main() {
  const i = process.argv.indexOf("--send");
  const to = i >= 0 ? process.argv[i + 1] : undefined;
  if (i >= 0 && !to) {
    console.error("Usage: --send you@example.com");
    process.exit(1);
  }
  const hosted = process.argv.includes("--hosted");

  fs.mkdirSync(OUT, { recursive: true });
  // The sample logo is one of the board's captures, copied beside the previews.
  const logoSrc = path.join(process.cwd(), "design/v13/logos/suyinsama.jpg");
  const haveLogo = fs.existsSync(logoSrc);
  if (haveLogo) fs.copyFileSync(logoSrc, path.join(OUT, "sample-logo.jpg"));
  const seal = path.relative(OUT, path.join(process.cwd(), "public/email/seal.png"));

  const index: string[] = [];
  for (const p of previews) {
    let html = p.html;
    if (!hosted) {
      html = html.split(SEAL_URL).join(seal);
      html = html.split(LOGO).join(haveLogo ? "sample-logo.jpg" : "");
    }
    fs.writeFileSync(path.join(OUT, `${p.name}.html`), html);
    index.push(`<li><a href="${p.name}.html">${p.name}</a> · ${p.subject.replace(/</g, "&lt;")}</li>`);
  }
  fs.writeFileSync(
    path.join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Email previews</title><ul style="font:15px/1.8 system-ui">${index.join("")}</ul>`
  );
  console.log(`Wrote ${previews.length} previews to ${OUT}`);

  if (to) {
    // Loaded only here: the mailer pulls in Prisma, which render mode has no need of.
    const mailer = await import("@/lib/mailer");
    for (const p of previews) {
      await p.send(to, mailer);
      console.log(`sent ${p.name} → ${to}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
