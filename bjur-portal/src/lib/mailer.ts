import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { renderOnboardingEmailHtml, type OnboardingEmailProps } from "@/emails/onboarding";
import { renderDeliveryEmailHtml, type DeliveryEmailProps } from "@/emails/delivery";

function mailFrom() {
  return process.env.MAIL_FROM ?? process.env.SMTP_FROM ?? "Bjur Media <hello@bjur.media>";
}

/**
 * Resend's HTTP API. Preferred over SMTP when RESEND_API_KEY is set: no outbound
 * SMTP port to get blocked on the NAS, and failures come back as a readable status
 * + body instead of a socket timeout.
 */
async function sendViaResend(opts: { to: string; subject: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

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
  if (process.env.RESEND_API_KEY) {
    await sendViaResend(opts);
    return { sent: true };
  }

  const transport = getTransport();

  if (!transport) {
    console.log(`[mailer] SMTP not configured — logging email to ${opts.to}: "${opts.subject}"`);
    await db.activity.create({
      data: { actor: "Mailer", action: `(dev) would send "${opts.subject}" to ${opts.to}` },
    });
    return { sent: false };
  }

  await transport.sendMail({
    from: mailFrom(),
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

export async function sendDeliveryEmail(to: string, props: DeliveryEmailProps) {
  const html = renderDeliveryEmailHtml(props);
  const subject = props.isUpdate
    ? `${props.projectTitle} has been updated`
    : `Your ${props.projectTitle} deliverables are ready`;
  return sendMail({ to, subject, html });
}
