import { db } from "@/lib/db";
import { timeAgo, formatDate, formatBytes, formatViews, isRecentlyActive } from "@/lib/format";
import { summarizeActivity } from "@/lib/activityFeed";
import { AdminDashboardClient } from "@/components/AdminDashboardClient";

// Worker status, queue depth, and recent activity are only meaningful live — a cached
// render could show "offline" long after the worker came back, or vice versa.
export const dynamic = "force-dynamic";

const HEARTBEAT_TIMEOUT_MS = 15_000;

export default async function AdminDashboardPage() {
  const [activeClients, liveProjects, assets, heartbeat, recentActivity, expiringProjects, recentProjects, clients] =
    await Promise.all([
      db.client.count({ where: { status: "ACTIVE" } }),
      db.project.count({ where: { status: "LIVE" } }),
      db.asset.findMany({ select: { sizeBytes: true } }),
      db.workerHeartbeat.findUnique({ where: { id: 1 } }),
      // Fetched wider than the ~8 we'll display — a burst of routine proxy
      // completions can otherwise push every real event out of a 6-row window
      // before summarizeActivity() ever gets a chance to collapse them down.
      db.activity.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
      db.project.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: "asc" },
        take: 5,
        include: { client: true },
      }),
      db.project.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { client: true, assets: { select: { id: true } } },
      }),
      db.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    ]);

  const queueCount = await db.asset.count({ where: { proxyStatus: { in: ["PENDING", "GENERATING"] } } });
  const failedCount = await db.asset.count({ where: { proxyStatus: "FAILED" } });
  const totalBytes = assets.reduce((t, a) => t + a.sizeBytes, BigInt(0));
  const workerOnline = !!heartbeat && isRecentlyActive(heartbeat.lastSeen, HEARTBEAT_TIMEOUT_MS);

  const [socialAccountErrors, topSocialPosts] = await Promise.all([
    db.socialAccount.findMany({ where: { lastSyncError: { not: null } }, include: { client: true } }),
    db.socialPost.findMany({
      where: { assetId: { not: null }, viewCount: { gt: 0 } },
      orderBy: { viewCount: "desc" },
      take: 3,
      include: { asset: { include: { project: { include: { client: true } } } } },
    }),
  ]);

  const summarizedActivity = summarizeActivity(recentActivity).slice(0, 8);

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  const statusColor: Record<string, string> = {
    LIVE: "#2ec36b",
    DRAFT: "var(--accentb)",
  };

  return (
    <AdminDashboardClient
      dateLabel={dateLabel}
      stats={[
        { value: String(activeClients), label: "Active clients" },
        { value: String(liveProjects), label: "Live galleries" },
        { value: String(assets.length), label: "Deliverables" },
        { value: formatBytes(totalBytes), label: "Storage indexed" },
      ]}
      workerOnline={workerOnline}
      queueCount={queueCount}
      failedCount={failedCount}
      activity={summarizedActivity.map((a) => ({
        id: a.id,
        who: a.actor,
        action: a.action,
        when: timeAgo(a.createdAt),
        dot: a.actor === "Worker" ? "var(--muted)" : "#2ec36b",
      }))}
      expiring={expiringProjects.map((p) => ({
        id: p.id,
        title: p.title,
        client: p.client.name,
        expires: formatDate(p.expiresAt),
      }))}
      recentDeliveries={recentProjects.map((p) => ({
        id: p.id,
        title: p.title,
        client: p.client.name,
        count: `${p.assets.length} files`,
        delivered: formatDate(p.deliveredAt),
        statusColor: statusColor[p.status] ?? "var(--dim)",
      }))}
      clients={clients.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      socialErrors={socialAccountErrors.map((a) => ({
        id: a.id,
        clientName: a.client.name,
        platform: a.platform === "INSTAGRAM" ? "Instagram" : "YouTube",
        error: a.lastSyncError!,
      }))}
      topSocialPosts={topSocialPosts
        .filter((p) => p.asset)
        .map((p) => ({
          id: p.id,
          assetName: p.asset!.name,
          clientName: p.asset!.project.client.name,
          projectId: p.asset!.projectId,
          views: formatViews(p.viewCount),
        }))}
    />
  );
}
