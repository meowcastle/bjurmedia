// The payment-release email: sent once, when staff turn a project's payment hold off.
//
// Its job is to close the loop on a specific promise: the client has been looking at
// watermarked files, they have paid, and the mark is now gone. So it leads with that
// rather than with "new work", which is delivery.tsx's job and would be wrong here.
// Nothing new has landed; what changed is what they are allowed to take.
//
// Plain HTML string on the shared shell (shell.tsx), for the same reasons as
// delivery.tsx.

import { renderShell, firstName } from "@/emails/shell";

export type ReleasedEmailProps = {
  clientName: string;
  recipientName: string;
  projectTitle: string;
  /** Deep link to this project's gallery, e.g. https://portal…/p/<id> */
  projectUrl: string;
  /** How many client-visible files are now clean. */
  fileCount: number;
  /**
   * How many of those were raw camera originals or audio — files a hold locks outright
   * rather than watermarks (paymentHold.ts, lockedUnderHold). They were never marked, so
   * "the watermarks are off" says nothing about them; they were unlocked.
   */
  unlockedCount?: number;
  expiresAt: string | null;
  /** Absolute URL of the client's logo, when they have one. */
  logoUrl?: string | null;
};

export function renderReleasedEmailHtml({
  clientName,
  recipientName,
  projectTitle,
  projectUrl,
  fileCount,
  unlockedCount = 0,
  expiresAt,
  logoUrl,
}: ReleasedEmailProps): string {
  const plural = fileCount === 1 ? "file" : "files";

  // A RAW delivery: every file was locked, none was ever watermarked, and nothing the
  // client took earlier needs replacing — so no mention of marks at all.
  if (unlockedCount > 0 && unlockedCount >= fileCount) {
    return renderShell({
      preheader: `Your ${projectTitle} files are unlocked and ready to download.`,
      logoUrl,
      kicker: `Thank you · ${clientName}`,
      headline: `Your ${projectTitle} files are ready.`,
      body: `Hi ${firstName(recipientName)}. Thank you for your purchase. All ${fileCount} ${plural} in ${projectTitle} are unlocked and yours to download.`,
      facts: [
        { label: "Project", value: projectTitle },
        { label: "Files", value: `${fileCount} · unlocked` },
        ...(expiresAt ? [{ label: "Available until", value: expiresAt }] : []),
      ],
      cta: { label: "Download your files", url: projectUrl },
      unsubscribe:
        "You are receiving this because you are an owner on this account and these files were just released to you.",
    });
  }

  const unlockedLine =
    unlockedCount > 0
      ? ` The ${unlockedCount} raw and audio ${unlockedCount === 1 ? "file is" : "files are"} unlocked too.`
      : "";

  return renderShell({
    preheader: `The watermarks are off. Your ${projectTitle} files are ready to download.`,
    logoUrl,
    kicker: `Thank you · ${clientName}`,
    headline: `Your ${projectTitle} files are ready.`,
    body: `Hi ${firstName(recipientName)}. Thank you for your purchase. The watermarks are off, and all ${fileCount} ${plural} in ${projectTitle} are yours to download at full quality.${unlockedLine}`,
    facts: [
      { label: "Project", value: projectTitle },
      { label: "Files", value: `${fileCount} · no watermark` },
      ...(expiresAt ? [{ label: "Available until", value: expiresAt }] : []),
    ],
    cta: { label: "Download your files", url: projectUrl },
    note: "Anything you downloaded before still carries the mark, so download the finals again from the project.",
    unsubscribe:
      "You are receiving this because you are an owner on this account and these files were just released to you.",
  });
}
