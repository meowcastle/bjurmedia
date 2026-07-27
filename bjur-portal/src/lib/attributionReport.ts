import { mondayOfWeek } from "@/lib/weeks";

export type ReportAssetPost = {
  viewCount: number;
  permalink: string | null;
  platform: "INSTAGRAM" | "YOUTUBE";
};

export type ReportAsset = {
  id: string;
  name: string;
  format: string;
  thumbRelPath: string | null;
  socialPosts: ReportAssetPost[];
};

export type PlatformStat = { platform: string; totalViews: number; medianViews: number; postCount: number };
export type TopAsset = {
  id: string;
  name: string;
  format: string;
  thumbRelPath: string | null;
  totalViews: number;
  platforms: string[];
  permalink: string | null;
};

export type AttributionReport = {
  totalAssets: number;
  totalsByFormat: Record<string, number>;
  publishRate: number; // 0-1
  platformStats: PlatformStat[];
  topAssets: TopAsset[];
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function buildAttributionReport(assets: ReportAsset[]): AttributionReport {
  const totalsByFormat: Record<string, number> = {};
  const viewsByPlatform = new Map<string, number[]>();
  let publishedCount = 0;

  for (const a of assets) {
    totalsByFormat[a.format] = (totalsByFormat[a.format] ?? 0) + 1;
    if (a.socialPosts.length > 0) publishedCount += 1;

    for (const p of a.socialPosts) {
      const list = viewsByPlatform.get(p.platform) ?? [];
      list.push(p.viewCount);
      viewsByPlatform.set(p.platform, list);
    }
  }

  const platformStats: PlatformStat[] = [...viewsByPlatform.entries()]
    .map(([platform, views]) => ({
      platform,
      totalViews: views.reduce((sum, v) => sum + v, 0),
      medianViews: median(views),
      postCount: views.length,
    }))
    .sort((a, b) => b.totalViews - a.totalViews);

  const topAssets: TopAsset[] = assets
    .map((a) => ({
      id: a.id,
      name: a.name,
      format: a.format,
      thumbRelPath: a.thumbRelPath,
      totalViews: a.socialPosts.reduce((sum, p) => sum + p.viewCount, 0),
      platforms: [...new Set(a.socialPosts.map((p) => p.platform))],
      permalink: a.socialPosts.find((p) => p.permalink)?.permalink ?? null,
    }))
    .filter((a) => a.totalViews > 0)
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 5);

  return {
    totalAssets: assets.length,
    totalsByFormat,
    publishRate: assets.length > 0 ? publishedCount / assets.length : 0,
    platformStats,
    topAssets,
  };
}

export type WeekBucket = { weekStart: string; delivered: number; views: number };

/** Buckets assets by the Monday of their createdAt's week — consistent with what
 * "in range" already means for the rest of the report, not the separate/optional
 * `weekOf` content-calendar field. */
export function buildWeeklyTrend(assets: { createdAt: Date; socialPosts: { viewCount: number }[] }[]): WeekBucket[] {
  const map = new Map<string, { weekStart: Date; delivered: number; views: number }>();
  for (const a of assets) {
    const monday = mondayOfWeek(a.createdAt);
    const key = monday.toISOString();
    const bucket = map.get(key) ?? { weekStart: monday, delivered: 0, views: 0 };
    bucket.delivered += 1;
    bucket.views += a.socialPosts.reduce((sum, p) => sum + p.viewCount, 0);
    map.set(key, bucket);
  }
  return [...map.values()]
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
    .map((b) => ({ weekStart: b.weekStart.toISOString(), delivered: b.delivered, views: b.views }));
}
