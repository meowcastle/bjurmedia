import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { renderOnboardingEmailHtml, type OnboardingEmailProps } from "@/emails/onboarding";

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

/**
 * Sends mail via SMTP if configured (SMTP_HOST env), otherwise logs it to the admin
 * Activity feed so the flow is still demoable/testable without real mail infra.
 */
async function sendMail(opts: { to: string; subject: string; html: string }) {
  const transport = getTransport();

  if (!transport) {
    console.log(`[mailer] SMTP not configured — logging email to ${opts.to}: "${opts.subject}"`);
    await db.activity.create({
      data: { actor: "Mailer", action: `(dev) would send "${opts.subject}" to ${opts.to}` },
    });
    return { sent: false };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "Bjur Media <hello@bjur.media>",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return { sent: true };
}

export async function sendOnboardingEmail(to: string, props: OnboardingEmailProps) {
  const html = renderOnboardingEmailHtml(props);
  const subject = props.delivery
    ? `Your ${props.delivery.projectTitle} deliverables are ready`
    : `Your Bjur Media portal access is ready`;
  return sendMail({ to, subject, html });
}
