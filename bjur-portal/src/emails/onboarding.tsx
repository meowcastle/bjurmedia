// Welcome: sent when a client login is created, and again (as `reason: "reset"`) when
// staff reset that login's password. Both carry a temporary password, which is why they
// share a template: the credential table is the point of each.
//
// Plain HTML string, not JSX->render: email clients need literal inline style=""
// attributes, and Next's bundler disallows react-dom/server imports from route-reachable
// modules. The layout lives in shell.tsx.

import { renderShell, firstName } from "@/emails/shell";

export type OnboardingEmailProps = {
  clientName: string;
  recipientName: string;
  portalUrl: string;
  /**
   * The address they actually sign in with. This used to be the client's org handle
   * under a "Username" label — but login authenticates on email, so a new client was
   * handed a credential block naming something the form would never accept.
   */
  signInEmail: string;
  tempPassword: string;
  /** "reset" when staff issued a new temporary password to an existing login. */
  reason?: "welcome" | "reset";
  /** Absolute URL of the client's logo, when they have one. */
  logoUrl?: string | null;
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

export function renderOnboardingEmailHtml({
  clientName,
  recipientName,
  portalUrl,
  signInEmail,
  tempPassword,
  reason = "welcome",
  logoUrl,
  delivery,
}: OnboardingEmailProps): string {
  const base = portalUrl.replace(/\/$/, "");
  const host = base.replace(/^https?:\/\//, "");
  const hi = `Hi ${firstName(recipientName)}.`;

  const kicker =
    reason === "reset"
      ? `New password · ${clientName}`
      : delivery
        ? `New files · ${clientName}`
        : `Welcome · ${clientName}`;
  const headline =
    reason === "reset"
      ? "Your password has been reset."
      : delivery
        ? `Your ${delivery.projectTitle} files are ready.`
        : "Your portal login is ready.";
  const body =
    reason === "reset"
      ? `${hi} We set a new temporary password on your Bjur client portal login for ${clientName}. Sign in with it below and choose your own.`
      : delivery
        ? `${hi} You now have a login to the Bjur client portal for ${clientName}, and your ${delivery.projectTitle} files are already in it. Stream them in the browser, or download the masters at full resolution whenever you like.`
        : `${hi} You now have a login to the Bjur client portal for ${clientName}. Sign in to review cuts, leave notes on the frame and download your files as they land.`;

  return renderShell({
    preheader:
      reason === "reset" ? "A new temporary password for the portal." : "Your portal login is ready.",
    logoUrl,
    kicker,
    headline,
    body,
    factsTitle: "Your login",
    facts: [
      { label: "Sign in with", value: signInEmail },
      { label: "Temporary password", value: tempPassword, mono: true },
      { label: "Portal", value: host },
      ...(delivery?.expiresAt ? [{ label: "Available until", value: delivery.expiresAt }] : []),
    ],
    cta: { label: "Sign in", url: `${base}/login` },
    note:
      reason === "reset"
        ? "You will be asked to choose your own password when you sign in. If you did not ask for this, reply to this email."
        : "You will be asked to choose your own password the first time. Your login is just for you; if someone else on your team needs one, reply to this email.",
    unsubscribe:
      reason === "reset"
        ? "You are receiving this because your client portal password was reset."
        : "You are receiving this because Bjur set up a client portal login for you.",
  });
}
