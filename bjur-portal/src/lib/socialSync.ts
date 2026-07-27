import { db } from "@/lib/db";
import { fetchInstagramPosts } from "@/lib/instagram";
import { fetchYouTubeVideos } from "@/lib/youtube";
import { matchAssetForPost, type MatchCandidateAsset } from "@/lib/socialMatch";

/**
 * Syncs one linked account: fetches recent posts, refreshes view counts on
 * already-matched posts, and attempts to auto-match newly-seen posts against
 * that client's delivered assets. Non-fatal by design (mirrors slack.ts's
 * postSlackEvent split) — a failed sync never throws past this function, it
 * logs to Activity and records the error on the account for the admin UI.
 */
export async function syncSocialAccount(accountId: string) {
  const account = await db.socialAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  try {
    const posts =
      account.platform === "INSTAGRAM"
        ? await fetchInstagramPosts({ externalId: account.externalId, accessToken: account.accessToken ?? "" })
        : await fetchYouTubeVideos({ externalId: account.externalId }, (await getYoutubeApiKey()) ?? "");

    const candidateAssets = await db.asset.findMany({
      where: { project: { clientId: account.clientId }, internal: false },
      select: { id: true, kind: true, name: true, weekOf: true, createdAt: true },
    });

    for (const post of posts) {
      const existing = await db.socialPost.findUnique({ where: { externalPostId: post.externalPostId } });

      let assetId = existing?.assetId ?? null;
      let matchConfidence = existing?.matchConfidence ?? null;
      if (!assetId) {
        const matched = matchAssetForPost(
          { kind: post.kind, caption: post.caption, postedAt: post.postedAt },
          candidateAssets as MatchCandidateAsset[]
        );
        if (matched) {
          assetId = matched.id;
          matchConfidence = "auto";
        }
      }

      await db.socialPost.upsert({
        where: { externalPostId: post.externalPostId },
        create: {
          socialAccountId: account.id,
          externalPostId: post.externalPostId,
          permalink: post.permalink,
          caption: post.caption,
          postedAt: post.postedAt,
          viewCount: post.viewCount,
          assetId,
          matchConfidence,
        },
        update: {
          viewCount: post.viewCount,
          caption: post.caption,
          permalink: post.permalink,
          lastFetchedAt: new Date(),
          // Only backfill assetId/matchConfidence when nothing's set yet — never
          // let a re-run of the auto-matcher clobber a manual correction.
          ...(existing?.assetId ? {} : { assetId, matchConfidence }),
        },
      });
    }

    await db.socialAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    });
  } catch (err) {
    const message = (err as Error).message;
    await db.socialAccount.update({ where: { id: account.id }, data: { lastSyncError: message } });
    await db.activity.create({
      data: {
        actor: "Social sync",
        action: `Failed to sync ${account.platform} account ${account.externalId}: ${message}`,
      },
    });
  }
}

async function getYoutubeApiKey() {
  const config = await db.socialConfig.findUnique({ where: { id: 1 } });
  return config?.youtubeApiKey ?? null;
}

/** Syncs every linked account. Called by both the worker's weekly scheduler and,
 * potentially, a future "sync now" admin action — same one-function-many-callers
 * shape as slack.ts's postWeeklyDigest. */
export async function syncAllSocialAccounts() {
  const accounts = await db.socialAccount.findMany();
  for (const account of accounts) {
    await syncSocialAccount(account.id);
  }
  return { accountsSynced: accounts.length };
}
