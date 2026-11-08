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
  /** raw = camera originals (.braw/.r3d/.ari), audio = production sound. RAW projects only. */
  counts: { reels: number; films: number; stills: number; raw?: number; audio?: number };
  /**
   * The project is on a payment hold. Only changes the copy when raw clips or audio are
   * in the batch: those are locked until payment rather than watermarked.
   */
  held?: boolean;
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
    counts.raw ? count(counts.raw, "raw clip", "raw clips") : null,
    counts.audio ? count(counts.audio, "audio file", "audio files") : null,
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
  held = false,
  isUpdate,
  expiresAt,
  totalSize,
  deliveredAt,
  stillUrl,
  logoUrl,
}: DeliveryEmailProps): string {
  const hi = `Hi ${firstName(recipientName)}.`;
  const fileOnly = (counts.raw ?? 0) + (counts.audio ?? 0);
  const total = counts.reels + counts.films + counts.stills + fileOnly;
  const what = landed(counts);
  const verb = total === 1 ? "is" : "are";

  // Raw clips and audio do not stream — there is no preview of either — so a batch of
  // nothing else gets told to download, not to watch. On a hold they are locked rather
  // than watermarked, and the mail says when they open up.
  const allFileOnly = fileOnly > 0 && fileOnly === total;
  const how = allFileOnly
    ? "Download them from the project whenever you like."
    : "Stream them in the browser, or download the masters at full resolution whenever you like.";
  const lockedNote =
    held && fileOnly > 0
      ? allFileOnly
        ? " They unlock for download once payment clears."
        : " The raw clips and audio files unlock for download once payment clears."
      : "";

  const body = isUpdate
    ? `${hi} We updated the files in ${projectTitle}. ${how}${lockedNote}`
    : `${hi} ${what ? `${what} ${verb} in your portal.` : "New files are in your portal."} ${how}${lockedNote}`;

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
