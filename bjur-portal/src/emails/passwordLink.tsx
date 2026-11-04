// "Forgot password": the link to choose a new one, and the note that follows once it is
// changed. A link, not a temporary password: the client picks their own on the portal,
// so nothing usable sits in their inbox afterwards.
//
// Plain HTML string, like every template here. The layout lives in shell.tsx.

import { renderShell, firstName } from "@/emails/shell";

export type PasswordLinkEmailProps = {
  clientName: string;
  recipientName: string;
  signInEmail: string;
  /** /reset/<token> on the portal, absolute. */
  resetUrl: string;
  logoUrl?: string | null;
};

export type PasswordChangedEmailProps = {
  clientName: string;
  recipientName: string;
  portalUrl: string;
  logoUrl?: string | null;
};

export function renderPasswordLinkEmailHtml({
  clientName,
  recipientName,
  signInEmail,
  resetUrl,
  logoUrl,
}: PasswordLinkEmailProps): string {
  return renderShell({
    preheader: "Choose a new password for the portal. The link works for 30 minutes.",
    logoUrl,
    kicker: `Password · ${clientName}`,
    headline: "Choose a new password.",
    body: `Hi ${firstName(recipientName)}. You asked to reset your Bjur client portal password. Choose a new one below and you are signed straight in. The link works once, for the next 30 minutes.`,
    facts: [{ label: "Sign in with", value: signInEmail }],
    cta: { label: "Choose a new password", url: resetUrl },
    note: "Did not ask for this? Ignore this email. Your password stays as it is.",
    unsubscribe: "You are receiving this because a password reset was asked for on your client portal login.",
  });
}

export function renderPasswordChangedEmailHtml({
  clientName,
  recipientName,
  portalUrl,
  logoUrl,
}: PasswordChangedEmailProps): string {
  const base = portalUrl.replace(/\/$/, "");
  return renderShell({
    preheader: "Your portal password was just changed.",
    logoUrl,
    kicker: `Password · ${clientName}`,
    headline: "Your password was changed.",
    body: `Hi ${firstName(recipientName)}. The password on your Bjur client portal login was just changed, and any other device signed in was signed out.`,
    cta: { label: "Open the portal", url: `${base}/` },
    note: "Was this not you? Email hi@bjur.nyc and we will lock the login.",
    unsubscribe: "You are receiving this because your client portal password was changed.",
  });
}
