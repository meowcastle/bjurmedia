export type YouTubePost = {
  externalPostId: string;
  permalink: string | null;
  caption: string | null;
  postedAt: Date;
  kind: "VIDEO";
  viewCount: number;
};

type PlaylistItem = { snippet: { resourceId: { videoId: string } } };
type VideoStats = {
  id: string;
  snippet: { title?: string; description?: string; publishedAt: string };
  statistics: { viewCount?: string };
};

/**
 * Fetches recent uploads + view counts for a YouTube channel, using a single
 * global API key (no per-channel OAuth needed for public statistics on public
 * videos). Throws on failure — same non-fatal-catching split as instagram.ts.
 */
export async function fetchYouTubeVideos(
  account: { externalId: string },
  apiKey: string
): Promise<YouTubePost[]> {
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${account.externalId}&key=${apiKey}`
  );
  if (!channelRes.ok) {
    throw new Error(`YouTube channel fetch failed: ${channelRes.status} ${await channelRes.text()}`);
  }
  const channelJson = (await channelRes.json()) as {
    items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
  };
  const uploadsPlaylistId = channelJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];

  const itemsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=25&key=${apiKey}`
  );
  if (!itemsRes.ok) {
    throw new Error(`YouTube playlistItems fetch failed: ${itemsRes.status} ${await itemsRes.text()}`);
  }
  const itemsJson = (await itemsRes.json()) as { items?: PlaylistItem[] };
  const videoIds = (itemsJson.items ?? []).map((i) => i.snippet.resourceId.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(",")}&key=${apiKey}`
  );
  if (!statsRes.ok) {
    throw new Error(`YouTube videos fetch failed: ${statsRes.status} ${await statsRes.text()}`);
  }
  const statsJson = (await statsRes.json()) as { items?: VideoStats[] };

  return (statsJson.items ?? []).map((v) => ({
    externalPostId: v.id,
    permalink: `https://www.youtube.com/watch?v=${v.id}`,
    caption: [v.snippet.title, v.snippet.description].filter(Boolean).join("\n"),
    postedAt: new Date(v.snippet.publishedAt),
    kind: "VIDEO" as const,
    viewCount: Number(v.statistics?.viewCount ?? 0),
  }));
}
