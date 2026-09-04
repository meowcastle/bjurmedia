import { db } from "@/lib/db";
import { fetchInstagramPosts } from "@/lib/instagram";
import { fetchYouTubeVideos, type YouTubeAuth } from "@/lib/youtube";
import { refreshAccessToken } from "@/lib/youtubeAuth";
import { matchAssetForPost, type MatchCandidateAsset } from "@/lib/socialMatch";

/**
 * Syncs one linked account: fetches recent posts, refreshes view counts on
 * already-matched posts, and attempts to auto-match newly-seen posts against
 * that client's delivered assets. Non-fatal by design (mirrors slack.ts's
 * postSlackEvent split) — a failed sync never throws past this function, it
 * logs to Activity and records the error on the account for the admin UI.
 */
export type SyncDeps = {
  fetchInstagram: typeof fetchInstagramPosts;
  fetchYouTube: typeof fetchYouTubeVideos;
};

export async function syncSocialAccount(accountId: string, deps: Partial<SyncDeps> = {}) {
  const fetchIg = deps.fetchInstagram ?? fetchInstagramPosts;
  const fetchYt = deps.fetchYouTube ?? fetchYouTubeVideos;

  const account = await db.socialAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  try {
    if (account.platform === "INSTAGRAM" && !account.accessToken) {
      // Calling Meta with an empty token only ever returns an auth error. Saying so
      // directly is both faster and a more useful message than whatever Graph replies.
      throw new Error("This Instagram account has no access token. Reconnect it on the client's page.");
    }

    const posts =
      account.platform === "INSTAGRAM"
        ? await fetchIg({ externalId: account.externalId, accessToken: account.accessToken ?? "" })
        : await fetchYt({ externalId: account.externalId }, await youtubeAuthFor(account));

    const candidateAssets = await db.asset.findMany({
      where: { project: { clientId: account.clientId }, internal: false },
      select: { id: true, kind: true, name: true, weekOf: true, createdAt: true },
    });

    // The certain link. Anything this portal published stored the id the platform gave
    // back (Asset.ytVideoId / igMediaId), so the post can be attributed exactly rather
    // than guessed at from a filename appearing in a caption.
    const idLinked = await db.asset.findMany({
      where: {
        project: { clientId: account.clientId },
        ...(account.platform === "YOUTUBE" ? { ytVideoId: { not: null } } : { igMediaId: { not: null } }),
      },
      select: { id: true, ytVideoId: true, igMediaId: true },
    });
    const assetByPostId = new Map(
      idLinked.map((a) => [account.platform === "YOUTUBE" ? a.ytVideoId! : a.igMediaId!, a.id])
    );

    for (const post of posts) {
      const existing = await db.socialPost.findUnique({ where: { externalPostId: post.externalPostId } });

      let assetId = existing?.assetId ?? null;
      let matchConfidence = existing?.matchConfidence ?? null;

      const exactAssetId = assetByPostId.get(post.externalPostId) ?? null;
      if (exactAssetId) {
        // An id match beats a filename-in-caption guess even when one is already
        // recorded: the guess can land on the wrong file of a batch delivered the same
        // week, and this cannot. A human's manual correction still outranks both.
        if (matchConfidence !== "manual") {
          assetId = exactAssetId;
          matchConfidence = "id";
        }
      } else if (!assetId) {
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
          // Backfill when nothing is set yet, and let an exact id match upgrade an
          // earlier guess. A manual correction is never overwritten — the branch above
          // leaves matchConfidence as "manual" and assetId as the human's choice.
          ...(existing?.assetId && matchConfidence !== "id" ? {} : { assetId, matchConfidence }),
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

/**
 * The shared API key when there is one — it is cheaper, and it needs no token round-trip.
 * Otherwise a channel connected for publishing can authenticate as itself, which means
 * connecting a channel is enough to get its numbers; the key becomes optional rather
 * than a second thing to remember.
 */
async function youtubeAuthFor(account: { refreshToken: string | null }): Promise<YouTubeAuth> {
  const apiKey = await getYoutubeApiKey();
  if (apiKey) return { apiKey };
  if (account.refreshToken) {
    const { accessToken } = await refreshAccessToken(account.refreshToken);
    return { accessToken };
  }
  throw new Error(
    "No YouTube API key set on the Integrations page, and this channel isn't connected for publishing."
  );
}

/** Syncs every linked account. Called by both the worker's weekly scheduler and,
 * potentially, a future "sync now" admin action — same one-function-many-callers
 * shape as slack.ts's postWeeklyDigest. */
export async function syncAllSocialAccounts(deps: Partial<SyncDeps> = {}) {
  const accounts = await db.socialAccount.findMany();
  for (const account of accounts) {
    await syncSocialAccount(account.id, deps);
  }
  return { accountsSynced: accounts.length };
}
