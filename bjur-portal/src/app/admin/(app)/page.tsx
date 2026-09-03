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

  // §9 "Needs attention". Two sources, both of which clear themselves once acted on —
  // a card that cannot go quiet is one people stop reading.
  //
  // The handoff lists a third (upload batches "not yet reviewed"), which is left out
  // deliberately: UploadBatch has no reviewed flag and nothing would ever set one, so
  // those rows would sit there permanently.
  const [soonExpiring, unscheduledRetainer] = await Promise.all([
    db.project.findMany({
      where: {
        status: "LIVE",
        // new Date() rather than Date.now(): the purity lint rejects the latter, and
        // the queries above already take this form.
        expiresAt: { gt: new Date(), lte: new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { expiresAt: "asc" },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    // Retainer clients are the ones on a posting schedule, so an asset of theirs with
    // no delivery week is a file nobody has decided a date for — and it is invisible
    // to both the calendar and the weekly Slack post until someone does.
    db.asset.groupBy({
      by: ["projectId"],
      where: { internal: false, weekOf: null, project: { client: { type: "RETAINER", status: "ACTIVE" } } },
      _count: { _all: true },
    }),
  ]);

  const unscheduledProjects = unscheduledRetainer.length
    ? await db.project.findMany({
        where: { id: { in: unscheduledRetainer.map((r) => r.projectId) } },
        include: { client: { select: { name: true } } },
      })
    : [];
  const unscheduledCountByProject = new Map(
    unscheduledRetainer.map((r) => [r.projectId, r._count._all])
  );

  const attention = [
    ...soonExpiring.map((p) => ({
      id: `expiry-${p.id}`,
      kind: "expiry" as const,
      subject: `${p.title} expires ${formatDate(p.expiresAt)}`,
      body: `${p.client.name} · the client loses access on that date`,
      href: `/admin/projects/${p.id}`,
      action: "Open",
    })),
    ...unscheduledProjects.map((p) => ({
      id: `unscheduled-${p.id}`,
      kind: "unscheduled" as const,
      subject: `${unscheduledCountByProject.get(p.id) ?? 0} files with no delivery week`,
      body: `${p.client.name} · ${p.title} — not in the calendar or the Slack post`,
      href: `/admin/media?project=${p.id}`,
      action: "Schedule",
    })),
  ];

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
      attention={attention}
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
