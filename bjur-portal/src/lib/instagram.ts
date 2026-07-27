export type InstagramPost = {
  externalPostId: string;
  permalink: string | null;
  caption: string | null;
  postedAt: Date;
  kind: "PHOTO" | "VIDEO";
  viewCount: number;
};

type RawMedia = {
  id: string;
  caption?: string;
  timestamp: string;
  media_type: string;
  permalink?: string;
};

// Verify this against whatever Graph API version your access token is scoped
// to before relying on it in production — Meta has moved reel-view metrics
// across versions (e.g. "plays" -> "views"), and hard-coding a stale field
// name would silently return zeros rather than erroring.
const GRAPH_API_VERSION = "v21.0";
const VIDEO_METRIC = "plays";
const PHOTO_METRIC = "impressions";

/**
 * Fetches recent media + view/play counts for a linked Instagram Business
 * Account. Throws on failure rather than swallowing errors — callers (the
 * weekly sync job) are responsible for catching and logging non-fatally, the
 * same separation `slack.ts` uses between `postSlackEvent` (catches) and
 * whatever builds its payload.
 */
export async function fetchInstagramPosts(account: {
  externalId: string;
  accessToken: string;
}): Promise<InstagramPost[]> {
  const mediaUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.externalId}/media?fields=id,caption,timestamp,media_type,permalink&access_token=${encodeURIComponent(account.accessToken)}`;
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) {
    throw new Error(`Instagram media fetch failed: ${mediaRes.status} ${await mediaRes.text()}`);
  }
  const mediaJson = (await mediaRes.json()) as { data: RawMedia[] };

  const posts: InstagramPost[] = [];
  for (const item of mediaJson.data ?? []) {
    const kind: "PHOTO" | "VIDEO" = item.media_type === "VIDEO" || item.media_type === "REELS" ? "VIDEO" : "PHOTO";
    const metric = kind === "VIDEO" ? VIDEO_METRIC : PHOTO_METRIC;

    let viewCount = 0;
    const insightsUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${item.id}/insights?metric=${metric}&access_token=${encodeURIComponent(account.accessToken)}`;
    const insightsRes = await fetch(insightsUrl);
    if (insightsRes.ok) {
      const insightsJson = (await insightsRes.json()) as { data?: { values?: { value: number }[] }[] };
      viewCount = insightsJson.data?.[0]?.values?.[0]?.value ?? 0;
    }
    // A single post's insights failing (e.g. a metric unsupported for that
    // media type) shouldn't drop the whole account's sync — it just keeps
    // viewCount at 0 for that post rather than throwing.

    posts.push({
      externalPostId: item.id,
      permalink: item.permalink ?? null,
      caption: item.caption ?? null,
      postedAt: new Date(item.timestamp),
      kind,
      viewCount,
    });
  }
  return posts;
}
