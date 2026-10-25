// Delivery notification: the "new work is live" email, sent by the debounced batcher in
// src/lib/deliveryNotify.ts. Deliberately carries no credentials: this goes to people
// who already have a login, and repeating a password in every delivery mail is exactly
// how one ends up forwarded.
//
// Plain HTML string on the shared shell (shell.tsx), for the same reasons as
// onboarding.tsx.

import { renderShell, firstName } from "@/emails/shell";

export type DeliveryEmailProps = {
  clientName: string;
  recipientName: string;
  projectTitle: string;
  /** Deep link to this project's gallery, e.g. https://portal…/p/<id> */
  projectUrl: string;
  counts: { reels: number; films: number; stills: number };
  /** True when this batch replaced existing files rather than adding new ones. */
  isUpdate: boolean;
  expiresAt: string | null;
  /** "2.1 GB", when the sender knows it. Joins the file count in the facts. */
  totalSize?: string | null;
  /** "Oct 21, 2026". Defaults to the day it is sent. */
  deliveredAt?: string | null;
  /** Absolute URL of a still from the project, shown above the facts. */
  stillUrl?: string | null;
  /** Absolute URL of the client's logo, when they have one. */
  logoUrl?: string | null;
};

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function count(n: number, one: string, many: string) {
  return `${n <= 10 ? WORDS[n] : n} ${n === 1 ? one : many}`;
}

/** "Two reels and 12 stills". Only what actually landed: a batch of three reels
 * announcing "0 films, 0 stills" is noise that hides the one real number. */
function landed(counts: DeliveryEmailProps["counts"]) {
  const parts = [
    counts.reels ? count(counts.reels, "reel", "reels") : null,
    counts.films ? count(counts.films, "film", "films") : null,
    counts.stills ? count(counts.stills, "still", "stills") : null,
  ].filter((p): p is string => p != null);
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

export function renderDeliveryEmailHtml({
  clientName,
  recipientName,
  projectTitle,
  projectUrl,
  counts,
  isUpdate,
  expiresAt,
  totalSize,
  deliveredAt,
  stillUrl,
  logoUrl,
}: DeliveryEmailProps): string {
  const hi = `Hi ${firstName(recipientName)}.`;
  const total = counts.reels + counts.films + counts.stills;
  const what = landed(counts);
  const verb = total === 1 ? "is" : "are";

  const body = isUpdate
    ? `${hi} We updated the files in ${projectTitle}. Stream them in the browser, or download the masters at full resolution whenever you like.`
    : `${hi} ${what ? `${what} ${verb} in your portal.` : "New files are in your portal."} Stream them in the browser, or download the masters at full resolution whenever you like.`;

  const delivered =
    deliveredAt ??
    new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return renderShell({
    preheader: isUpdate ? `${projectTitle} has been updated.` : `Your ${projectTitle} files are ready.`,
    logoUrl,
    kicker: isUpdate ? `Updated · ${clientName}` : `New files · ${clientName}`,
    headline: isUpdate ? `${projectTitle} has been updated.` : `Your ${projectTitle} files are ready.`,
    body,
    image: stillUrl,
    facts: [
      { label: "Project", value: projectTitle },
      { label: "Files", value: totalSize ? `${total} · ${totalSize}` : String(total) },
      { label: isUpdate ? "Updated" : "Delivered", value: delivered },
      ...(expiresAt ? [{ label: "Available until", value: expiresAt }] : []),
    ],
    cta: { label: "Open project", url: projectUrl },
    note: expiresAt
      ? `Links expire on ${expiresAt}. Ask us if you need them extended.`
      : "Your login is just for you, so please do not forward this email.",
    unsubscribe:
      "You are receiving this because delivery notifications are on for your account. Turn them off any time in Settings.",
  });
}
