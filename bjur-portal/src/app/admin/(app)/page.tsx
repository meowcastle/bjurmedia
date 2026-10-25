import { statfs } from "fs/promises";
import { db } from "@/lib/db";
import { timeAgo, formatDate, formatBytes, isRecentlyActive } from "@/lib/format";
import { summarizeActivity, plainActivity } from "@/lib/activityFeed";
import { MEDIA_ROOT } from "@/lib/media";
import { AdminDashboardClient } from "@/components/AdminDashboardClient";
import type { ClientMark } from "@/components/ClientLogo";

// What a row needs to show a client the v13 way: its logo, or initials on its colour.
const MARK = { name: true, logoUrl: true, logoColor: true } as const;
const mark = (c: { name: string; logoUrl: string | null; logoColor: string | null }): ClientMark => ({
  name: c.name,
  logoUrl: c.logoUrl,
  logoColor: c.logoColor,
});

/** Free space on the media volume, or null where it can't be read (the row is left out). */
async function freeSpace(): Promise<string | null> {
  try {
    const s = await statfs(MEDIA_ROOT);
    return formatBytes(Number(s.bavail) * Number(s.bsize));
  } catch {
    return null;
  }
}

// Worker status, queue depth, and recent activity are only meaningful live — a cached
// render could show "offline" long after the worker came back, or vice versa.
export const dynamic = "force-dynamic";

const HEARTBEAT_TIMEOUT_MS = 15_000;

export default async function AdminDashboardPage() {
  const [activeClients, heartbeat, recentActivity, recentProjects, clients] =
    await Promise.all([
      db.client.count({ where: { status: "ACTIVE" } }),
      db.workerHeartbeat.findUnique({ where: { id: 1 } }),
      // Fetched wider than the ~8 we'll display — a burst of routine proxy
      // completions can otherwise push every real event out of a 6-row window
      // before summarizeActivity() ever gets a chance to collapse them down.
      db.activity.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
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
  // Media is per project now, so "N failed" opens the project holding the newest failure.
  const firstFailed = failedCount
    ? await db.asset.findFirst({
        where: { proxyStatus: "FAILED" },
        orderBy: { updatedAt: "desc" },
        select: { projectId: true },
      })
    : null;
  const workerOnline = !!heartbeat && isRecentlyActive(heartbeat.lastSeen, HEARTBEAT_TIMEOUT_MS);

  // The System column: worker, Slack, social insights, storage. Each from what the portal
  // already records; a row with nothing real behind it is left out rather than guessed.
  const [socialAccountErrors, socialAccountCount, slack, storageFree, covers] = await Promise.all([
    db.socialAccount.findMany({ where: { lastSyncError: { not: null } }, include: { client: true } }),
    db.socialAccount.count(),
    db.slackConfig.findUnique({ where: { id: 1 } }),
    freeSpace(),
    // The still beside each recent project: its newest client-visible file with a thumbnail.
    db.asset.findMany({
      where: { projectId: { in: recentProjects.map((p) => p.id) }, internal: false, thumbRelPath: { not: null } },
      orderBy: { createdAt: "desc" },
      distinct: ["projectId"],
      select: { id: true, projectId: true },
    }),
  ]);
  const coverByProject = new Map(covers.map((c) => [c.projectId, c.id]));

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
      include: { client: { select: MARK } },
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
            project: { select: { title: true, client: { select: MARK } } },
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
            project: { select: { title: true, client: { select: MARK } } },
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
                project: { select: { title: true, client: { select: MARK } } },
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
      client: { select: { id: true, ...MARK } },
      submissions: { where: { status: "COMPLETE" }, select: { sizeBytes: true } },
    },
  });

  const unscheduledProjects = unscheduledRetainer.length
    ? await db.project.findMany({
        where: { id: { in: unscheduledRetainer.map((r) => r.projectId) } },
        include: { client: { select: MARK } },
      })
    : [];
  const unscheduledCountByProject = new Map(
    unscheduledRetainer.map((r) => [r.projectId, r._count])
  );

  // A client changed a caption on a reel that is on a day. The change cleared (or never
  // got) staff approval, so the week will not go out until someone reads it again.
  const clientEditedCaptions = await db.asset.findMany({
    where: {
      captionEditedBy: "CLIENT",
      captionApprovedAt: null,
      postedToSlackAt: null,
      weekOf: { not: null },
      captionEditedAt: { gte: new Date(new Date().getTime() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { captionEditedAt: "desc" },
    take: 6,
    select: {
      id: true,
      name: true,
      contentTitle: true,
      weekOf: true,
      projectId: true,
      project: { select: { title: true, client: { select: MARK } } },
    },
  });

  // The CRM's approval queue. Without a row here it is only seen by someone who thinks to
  // open the Inbox, which defeats a follow-up agent.
  const pendingDrafts = await db.agentDraft.count({ where: { state: "PENDING" } });

  const attention = [
    ...(pendingDrafts
      ? [
          {
            id: "drafts",
            kind: "drafts" as const,
            subject: `${pendingDrafts} draft${pendingDrafts === 1 ? "" : "s"} waiting`,
            body: "Follow-ups the agent wrote for you to read before they go out",
            client: null,
            href: "/admin/inbox",
            action: "Open inbox",
          },
        ]
      : []),
    ...unsentCuts.map((r) => ({
      id: `cut-ready-${r.id}`,
      kind: "cut-ready" as const,
      subject: `${r.asset.project.title} · cut ${r.version} is up`,
      body: `${r.asset.project.client.name} · answer the notes on cut ${r.version - 1}, then send`,
      client: mark(r.asset.project.client),
      href: `/admin/projects/${r.asset.projectId}/review`,
      action: "Answer notes",
    })),
    ...noteBatches.map(({ first, notes }) => ({
      id: `notes-in-${first.reviewId}-${first.reviewerId}`,
      kind: "notes-in" as const,
      subject: `${first.review.asset.project.title} · cut ${first.review.version}`,
      body: `${first.reviewer.name}${first.reviewer.role ? ` · ${first.reviewer.role}` : ""} sent ${
        notes.length
      } note${notes.length === 1 ? "" : "s"}: “${notes[notes.length - 1].body}”`,
      client: mark(first.review.asset.project.client),
      href: `/admin/projects/${first.review.asset.projectId}/review`,
      action: "Open review",
    })),
    ...approvedCuts.map((r) => ({
      id: `approved-${r.id}`,
      kind: "approved" as const,
      subject: `${r.approvedBy?.name ?? "A reviewer"} approved cut ${r.version}`,
      body: `${r.asset.project.client.name} · ${r.asset.project.title}`,
      client: mark(r.asset.project.client),
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
        client: mark(b.client),
        body: `${b.client.name} · ${b.submissions.length} file${
          b.submissions.length === 1 ? "" : "s"
        } · ${formatBytes(bytes)}`,
        href: `/admin/clients/${b.client.id}`,
        action: "Open client",
      };
    }),
    ...clientEditedCaptions.map((a) => ({
      id: `caption-edited-${a.id}`,
      kind: "caption-edited" as const,
      subject: `${a.contentTitle?.trim() || a.name} · edited by client`,
      body: `${a.project.title} · ${a.weekOf!.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })} · needs your approval again`,
      client: mark(a.project.client),
      href: `/admin/media?project=${a.projectId}&asset=${a.id}`,
      action: "Open board",
    })),
    ...soonExpiring.map((p) => ({
      id: `expiry-${p.id}`,
      kind: "expiry" as const,
      subject: `${p.title} expires ${formatDate(p.expiresAt)}`,
      body: p.client.name,
      client: mark(p.client),
      href: `/admin/projects/${p.id}`,
      action: "Open",
    })),
    ...unscheduledProjects.map((p) => ({
      id: `unscheduled-${p.id}`,
      kind: "unscheduled" as const,
      subject: `${unscheduledCountByProject.get(p.id) ?? 0} files with no delivery week`,
      body: `${p.client.name} · ${p.title}`,
      client: mark(p.client),
      href: `/admin/media?project=${p.id}`,
      action: "Schedule",
    })),
  ];

  const summarizedActivity = summarizeActivity(recentActivity).slice(0, 8);

  // "Wednesday, October 22", in the studio's own time zone.
  const dateLine = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  return (
    <AdminDashboardClient
      dateLine={dateLine}
      activeClients={activeClients}
      attention={attention}
      workerOnline={workerOnline}
      queueCount={queueCount}
      failedCount={failedCount}
      failedHref={firstFailed ? `/admin/media?project=${firstFailed.projectId}` : null}
      activity={summarizedActivity.map((a) => ({
        id: a.id,
        who: a.actor,
        action: plainActivity(a.action),
        // "8m", not "8m ago": the column already reads as time.
        when: timeAgo(a.createdAt).replace(/ ago$/, ""),
      }))}
      recentDeliveries={recentProjects.map((p) => ({
        id: p.id,
        title: p.title,
        client: mark(p.client),
        coverAssetId: coverByProject.get(p.id) ?? null,
        count: `${p.assets.length} file${p.assets.length === 1 ? "" : "s"}`,
        delivered: p.deliveredAt
          ? p.deliveredAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "\u2014",
      }))}
      clients={clients.map((c) => ({ id: c.id, name: c.name, hasSlackChannel: c.channel !== null }))}
      system={{
        slack: slack?.connected ? (slack.workspace ?? "Connected") : null,
        socialAccounts: socialAccountCount,
        socialErrors: socialAccountErrors.map(
          (a) => `${a.client.name} · ${a.platform === "INSTAGRAM" ? "Instagram" : "YouTube"}: ${a.lastSyncError}`
        ),
        storageFree,
      }}
    />
  );
}
