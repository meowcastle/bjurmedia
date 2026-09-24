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
      db.client.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        include: { channel: { select: { clientId: true } } },
      }),
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
    // Projects on the board are the ones with a posting schedule, so an asset there
    // with no delivery week is a file nobody has decided a date for — invisible to both
    // the board and the Slack post until someone does. This keyed off the client being
    // a "retainer" before, which was a guess; the board switch says it outright.
    db.asset.groupBy({
      by: ["projectId"],
      where: { internal: false, weekOf: null, project: { type: "CALENDAR", client: { status: "ACTIVE" } } },
      _count: true,
    }),
  ]);

  // The cut loop, as three things that might need you.
  //
  // "feedback" is gone with the old model. A note is no longer an answer to a cut — it is
  // one of several a reviewer sends in a batch, and what the studio owes back is the next
  // cut with every note answered. So: a cut sitting unsent, batches that have arrived,
  // and an approval that frees the master.
  const [unsentCuts, approvedCuts, sentNotes] = await Promise.all([
    db.review.findMany({
      where: { sentAt: null, asset: { project: { type: "FILM" } } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        asset: {
          select: {
            name: true,
            contentTitle: true,
            projectId: true,
            project: { select: { title: true, client: { select: { name: true } } } },
          },
        },
      },
    }),
    db.review.findMany({
      where: { state: "APPROVED" },
      orderBy: { approvedAt: "desc" },
      take: 4,
      include: {
        approvedBy: { select: { name: true } },
        asset: {
          select: {
            name: true,
            contentTitle: true,
            projectId: true,
            project: { select: { title: true, client: { select: { name: true } } } },
          },
        },
      },
    }),
    // Sent notes only, ever. A draft is private to its author and must not reach a staff
    // surface even as a count on a feed.
    db.reviewNote.findMany({
      where: { sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      take: 30,
      include: {
        reviewer: { select: { id: true, name: true, role: true } },
        review: {
          select: {
            id: true,
            version: true,
            asset: {
              select: {
                name: true,
                contentTitle: true,
                projectId: true,
                project: { select: { title: true, client: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  // One row per batch, not per note: a reviewer who sent five notes at once is one thing
  // to deal with, and five identical cards is how a feed stops being read.
  const noteBatches = [...
    sentNotes
      .reduce((acc, n) => {
        const key = `${n.reviewId}:${n.reviewerId}`;
        const at = acc.get(key);
        if (at) at.notes.push(n);
        else acc.set(key, { first: n, notes: [n] });
        return acc;
      }, new Map<string, { first: typeof sentNotes[number]; notes: typeof sentNotes }>())
      .values(),
  ].slice(0, 6);

  // Footage that arrived through a send link. It reaches Slack as it lands, file by
  // file, which is the wrong shape for "what needs me" — a 40-clip drop is 40 pings and
  // one job. This is one row per batch, and it ages out after a week rather than needing
  // to be dismissed: a card that cannot go quiet is one people stop reading.
  const landedBatches = await db.uploadBatch.findMany({
    where: {
      requestId: { not: null },
      createdAt: { gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000) },
      submissions: { some: { status: "COMPLETE" } },
    },
    orderBy: { createdAt: "desc" },
    take: 6,
    include: {
      request: { select: { name: true } },
      client: { select: { id: true, name: true } },
      submissions: { where: { status: "COMPLETE" }, select: { sizeBytes: true } },
    },
  });

  const unscheduledProjects = unscheduledRetainer.length
    ? await db.project.findMany({
        where: { id: { in: unscheduledRetainer.map((r) => r.projectId) } },
        include: { client: { select: { name: true } } },
      })
    : [];
  const unscheduledCountByProject = new Map(
    unscheduledRetainer.map((r) => [r.projectId, r._count])
  );

  const attention = [
    ...unsentCuts.map((r) => ({
      id: `cut-ready-${r.id}`,
      kind: "cut-ready" as const,
      subject: `${r.asset.project.title} · cut ${r.version} is up`,
      body: `${r.asset.project.client.name} — answer the notes on cut ${r.version - 1}, then send`,
      href: `/admin/projects/${r.asset.projectId}/review`,
      action: "Answer notes",
    })),
    ...noteBatches.map(({ first, notes }) => ({
      id: `notes-in-${first.reviewId}-${first.reviewerId}`,
      kind: "notes-in" as const,
      subject: `${first.review.asset.project.title} · cut ${first.review.version}`,
      body: `${first.reviewer.name}${first.reviewer.role ? ` · ${first.reviewer.role}` : ""} sent ${
        notes.length
      } note${notes.length === 1 ? "" : "s"} — “${notes[notes.length - 1].body}”`,
      href: `/admin/projects/${first.review.asset.projectId}/review`,
      action: "Open review",
    })),
    ...approvedCuts.map((r) => ({
      id: `approved-${r.id}`,
      kind: "approved" as const,
      subject: `${r.approvedBy?.name ?? "A reviewer"} approved cut ${r.version}`,
      body: `${r.asset.project.client.name} · ${r.asset.project.title} — deliver the master`,
      href: `/admin/projects/${r.asset.projectId}`,
      action: "Open project",
    })),
    ...landedBatches.map((b) => {
      const bytes = b.submissions.reduce((n, x) => n + Number(x.sizeBytes), 0);
      const from = b.senderName ? ` · from ${b.senderName}` : "";
      return {
        id: `landed-${b.id}`,
        kind: "landed" as const,
        subject: `Footage in · ${b.name}${from}`,
        // The client, not a project. A batch does not know what it will be cut into, and
        // pretending otherwise is what sent a fortnight of rushes into a review job.
        body: `${b.client.name} — ${b.submissions.length} file${
          b.submissions.length === 1 ? "" : "s"
        } · ${formatBytes(bytes)}`,
        href: `/admin/clients/${b.client.id}`,
        action: "Open client",
      };
    }),
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
      clients={clients.map((c) => ({ id: c.id, name: c.name, hasSlackChannel: c.channel !== null }))}
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
