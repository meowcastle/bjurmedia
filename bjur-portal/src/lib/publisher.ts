import { db } from "@/lib/db";
import { resolveDerivedPath } from "@/lib/media";
import { refreshAccessToken, youtubeOAuthConfigured } from "@/lib/youtubeAuth";
import { uploadVideo } from "@/lib/youtubeUpload";
import { postSlackEvent } from "@/lib/slack";

/** Three tries, then it stops and asks a human rather than hammering someone's channel. */
export const MAX_PUBLISH_ATTEMPTS = 3;

export class NotPublishableError extends Error {}

/**
 * The file that actually goes to YouTube.
 *
 * The proxy, not the master: masters are ProRes or BRAW — tens of gigabytes, and BRAW is
 * not a format YouTube ingests at all. The proxy is already 1080p H.264, which is what
 * a publish wants.
 *
 * The exception is a watermarked proxy. proxyGen watermarks the proxy for any licensable
 * asset, and putting a BJUR MEDIA · PREVIEW overlay on a client's own channel is worse
 * than not publishing.
 */
async function resolvePublishSource(asset: {
  proxyRelPath: string | null;
  proxyRes: string | null;
  licensable: boolean;
}) {
  if (!asset.proxyRelPath) {
    throw new NotPublishableError("No proxy has been generated for this file yet.");
  }
  if (asset.licensable || asset.proxyRes?.includes("watermarked")) {
    throw new NotPublishableError(
      "This file's proxy is watermarked because it is marked licensable. Turn licensing off, regenerate the proxy, then publish."
    );
  }
  return resolveDerivedPath(asset.proxyRelPath);
}

async function alertStaff(text: string) {
  await postSlackEvent({
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  }).catch(() => {});
}

/**
 * Publishes everything approved and due.
 *
 * Two properties matter more than throughput, because the blast radius is a client's own
 * public channel:
 *
 * 1. Never post twice. An asset is claimed by moving APPROVED → PUBLISHING in a
 *    conditional update, so a second runner finds nothing to claim, and ytVideoId being
 *    already set excludes it from the query outright.
 * 2. Never silently retry something that might already be live. If a row is still
 *    PUBLISHING it means the process died mid-upload — the video may well be on the
 *    channel. Those are surfaced for a human instead of being picked up again.
 */
export type PublishDeps = {
  upload: typeof uploadVideo;
  refresh: typeof refreshAccessToken;
  configured: () => boolean;
};

/**
 * The Google calls are injectable so the state machine above can be exercised for real —
 * happy path, partial publish, permanent refusal, transient retry, double-post guards —
 * without touching a live channel. The defaults are the real ones.
 */
export async function publishDuePosts(now = new Date(), deps: Partial<PublishDeps> = {}) {
  const upload = deps.upload ?? uploadVideo;
  const refresh = deps.refresh ?? refreshAccessToken;
  const configured = deps.configured ?? youtubeOAuthConfigured;

  if (!configured()) return { published: 0, failed: 0, skipped: 0 };

  const stranded = await db.asset.count({ where: { publishState: "PUBLISHING" } });
  if (stranded > 0) {
    await alertStaff(
      `:warning: ${stranded} post(s) are stuck mid-publish. They are *not* being retried automatically — the upload may have completed. Check the channel before re-running them.`
    );
  }

  const due = await db.asset.findMany({
    where: {
      publishState: "APPROVED",
      publishYt: true,
      ytVideoId: null,
      publishAt: { not: null, lte: now },
    },
    select: {
      id: true,
      name: true,
      contentTitle: true,
      caption: true,
      captionYT: true,
      proxyRelPath: true,
      proxyRes: true,
      licensable: true,
      publishIg: true,
      igMediaId: true,
      publishAttempts: true,
      project: { select: { clientId: true, title: true, client: { select: { name: true } } } },
    },
    orderBy: { publishAt: "asc" },
  });

  let published = 0;
  let failed = 0;
  let skipped = 0;

  for (const asset of due) {
    // Conditional claim. If this updates nothing, another runner already took it.
    const claim = await db.asset.updateMany({
      where: { id: asset.id, publishState: "APPROVED" },
      data: { publishState: "PUBLISHING", publishAttempts: { increment: 1 } },
    });
    if (claim.count === 0) {
      skipped++;
      continue;
    }

    const attempt = asset.publishAttempts + 1;

    try {
      const account = await db.socialAccount.findUnique({
        where: { clientId_platform: { clientId: asset.project.clientId, platform: "YOUTUBE" } },
        select: { id: true, refreshToken: true, handle: true },
      });
      if (!account?.refreshToken) {
        throw new NotPublishableError(
          `${asset.project.client.name} has no connected YouTube channel. Connect one on their client page.`
        );
      }

      const filePath = await resolvePublishSource(asset);
      const { accessToken, expiresAt } = await refresh(account.refreshToken);
      await db.socialAccount.update({ where: { id: account.id }, data: { tokenExpiresAt: expiresAt } });

      const { videoId, permalink } = await upload(accessToken, {
        filePath,
        title: asset.contentTitle || asset.name,
        // captionYT exists precisely for when the YouTube copy differs; falling back to
        // the shared caption is the common case.
        description: asset.captionYT ?? asset.caption ?? "",
      });

      // Instagram may still be outstanding. Recording the YouTube id but leaving the
      // asset APPROVED means it is not re-uploaded here (ytVideoId excludes it) and the
      // Instagram publisher can still pick it up — without ever claiming a post went out
      // everywhere when it went out on one platform.
      const fullyPublished = !asset.publishIg || asset.igMediaId != null;

      await db.asset.update({
        where: { id: asset.id },
        data: {
          ytVideoId: videoId,
          publishError: null,
          publishState: fullyPublished ? "PUBLISHED" : "APPROVED",
        },
      });

      await db.socialPost.create({
        data: {
          socialAccountId: account.id,
          assetId: asset.id,
          externalPostId: videoId,
          permalink,
          caption: asset.captionYT ?? asset.caption ?? null,
          postedAt: new Date(),
          matchConfidence: "auto",
        },
      });

      await db.activity.create({
        data: {
          actor: "Worker",
          action: `published "${asset.name}" to YouTube for ${asset.project.client.name}`,
        },
      });
      await postSlackEvent({
        clientId: asset.project.clientId,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:tv: *${asset.contentTitle || asset.name}* is live on YouTube — ${permalink}`,
            },
          },
        ],
      }).catch(() => {});

      published++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // A misconfiguration — no channel connected, no proxy, watermarked — will fail
      // identically every time. Retrying it three times just delays telling someone.
      const permanent = err instanceof NotPublishableError;
      const giveUp = permanent || attempt >= MAX_PUBLISH_ATTEMPTS;

      await db.asset.update({
        where: { id: asset.id },
        data: { publishState: giveUp ? "FAILED" : "APPROVED", publishError: message },
      });

      if (giveUp) {
        failed++;
        await alertStaff(
          `:x: Publishing *${asset.name}* (${asset.project.client.name} — ${asset.project.title}) failed${
            permanent ? "" : ` after ${attempt} attempts`
          }: ${message}`
        );
      } else {
        console.warn(`[publish] attempt ${attempt} for ${asset.name} failed, will retry: ${message}`);
      }
    }
  }

  return { published, failed, skipped };
}
