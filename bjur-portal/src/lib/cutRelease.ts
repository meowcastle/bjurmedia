import { db } from "@/lib/db";
import { openReview, releaseCut } from "@/lib/reviews";
import { notifyCutReady } from "@/lib/reviewMail";

/**
 * Send a cut to its reviewers and log it. The one path every release takes: the
 * studio's Send button, and a new cut going out on its own when it lands.
 */
export async function sendCut(reviewId: string, actor: string) {
  const result = await releaseCut(reviewId);
  if (!result.ok) return result;

  const mail = await notifyCutReady(reviewId);
  const cut = await db.review.findUnique({
    where: { id: reviewId },
    include: { asset: { select: { name: true, contentTitle: true } } },
  });
  await db.activity.create({
    data: {
      actor,
      action: `Mail: ${cut?.asset.contentTitle || cut?.asset.name} cut ${cut?.version} sent to ${
        mail.sent
      } reviewer${mail.sent === 1 ? "" : "s"}${mail.notes ? ` · ${mail.notes} notes answered` : ""}`,
    },
  });
  return { ok: true as const, sent: mail.sent };
}

/**
 * A cut that clients can watch goes to them. Called when its proxy is ready and when a
 * hidden file is shown again. Answering the last round's notes is optional: whatever is
 * answered by then travels in the email, the rest are simply not mentioned.
 */
export async function openAndSendCut(assetId: string) {
  const cut = await openReview(assetId);
  if (!cut || cut.sentAt) return cut;
  await sendCut(cut.id, "Worker");
  return cut;
}
