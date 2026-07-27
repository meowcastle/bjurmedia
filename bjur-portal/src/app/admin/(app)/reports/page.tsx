import { db } from "@/lib/db";
import { buildAttributionReport, buildWeeklyTrend } from "@/lib/attributionReport";
import { AdminReportsClient } from "@/components/AdminReportsClient";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 90;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; from?: string; to?: string }>;
}) {
  const { client: clientId, from: fromParam, to: toParam } = await searchParams;

  const clients = await db.client.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!clientId) {
    return <AdminReportsClient clients={clients} selectedClientId={null} report={null} />;
  }

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, accentColor: true } });
  if (!client) {
    return <AdminReportsClient clients={clients} selectedClientId={null} report={null} />;
  }

  const assets = await db.asset.findMany({
    where: {
      project: { clientId },
      internal: false,
      format: { in: ["Still", "Reel", "Film"] }, // Masters are production files, not delivered content
      createdAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      name: true,
      format: true,
      thumbRelPath: true,
      createdAt: true,
      socialPosts: {
        select: {
          viewCount: true,
          permalink: true,
          socialAccount: { select: { platform: true } },
        },
      },
    },
  });

  const reportAssets = assets.map((a) => ({
    id: a.id,
    name: a.name,
    format: a.format,
    thumbRelPath: a.thumbRelPath,
    socialPosts: a.socialPosts.map((p) => ({
      viewCount: p.viewCount,
      permalink: p.permalink,
      platform: p.socialAccount.platform,
    })),
  }));

  const report = buildAttributionReport(reportAssets);
  const weeklyTrend = buildWeeklyTrend(assets.map((a) => ({ createdAt: a.createdAt, socialPosts: a.socialPosts })));

  return (
    <AdminReportsClient
      clients={clients}
      selectedClientId={clientId}
      report={{
        clientName: client.name,
        accentColor: client.accentColor,
        from: from.toISOString(),
        to: to.toISOString(),
        ...report,
        weeklyTrend,
      }}
    />
  );
}
