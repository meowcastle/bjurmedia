import { db } from "@/lib/db";
import { timeAgo, formatDate, formatBytes, isRecentlyActive } from "@/lib/format";
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
      db.activity.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
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
  const totalBytes = assets.reduce((t, a) => t + a.sizeBytes, BigInt(0));
  const workerOnline = !!heartbeat && isRecentlyActive(heartbeat.lastSeen, HEARTBEAT_TIMEOUT_MS);

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
      activity={recentActivity.map((a) => ({
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
    />
  );
}
