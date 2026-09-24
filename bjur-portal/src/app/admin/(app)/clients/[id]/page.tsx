import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { inboxDirFor } from "@/lib/projects";
import { slugify, stateOf } from "@/lib/submissionRequests";
import { AdminClientDetailClient } from "@/components/AdminClientDetailClient";

export default async function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await db.client.findUnique({
    where: { id },
    include: {
      // Seats come from memberships now, not User.clientId — otherwise someone given
      // access to a second client would be invisible on that client's page.
      members: {
        where: { user: { deactivatedAt: null } },
        orderBy: { createdAt: "asc" },
        include: {
          user: { include: { projectMemberships: { select: { projectId: true, role: true } } } },
        },
      },
      projects: {
        orderBy: { createdAt: "desc" },
        include: { assets: { select: { id: true, internal: true } } },
      },
      // Intake hangs off the client now, so it is loaded once here rather than per
      // project. A batch knows nothing about what it will be cut into.
      submissionRequests: { orderBy: { createdAt: "desc" } },
      uploadBatches: {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true } },
          request: { select: { name: true } },
          submissions: {
            select: { sizeBytes: true, receivedBytes: true, status: true, filename: true },
          },
        },
      },
    },
  });
  if (!client) notFound();


  const since = new Date(new Date().getTime() - 30 * 86_400_000);

  const [socialAccounts, topPosts, channel] = await Promise.all([
    db.socialAccount.findMany({
      where: { clientId: client.id },
      select: { platform: true, handle: true },
    }),
    // §10c "Top posts · last 30 days" — which delivered files are actually performing.
    db.socialPost.findMany({
      where: { socialAccount: { clientId: client.id }, postedAt: { gte: since } },
      orderBy: { viewCount: "desc" },
      take: 5,
      include: {
        socialAccount: { select: { platform: true, handle: true, lastSyncedAt: true } },
        asset: { select: { name: true } },
      },
    }),
    db.clientChannel.findUnique({ where: { clientId: client.id }, select: { channel: true } }),
  ]);

  return (
    <AdminClientDetailClient
      client={{
        id: client.id,
        name: client.name,
        username: client.username,
        status: client.status,
        accentColor: client.accentColor,
        hasSlackChannel: channel !== null,
        logoUrl: client.logoUrl,
        // The one quiet line under the header, assembled here so the page can stay a
        // list: what is switched on for this client, and where to go to change it.
        slackChannel: channel?.channel ?? null,
        accountCount: socialAccounts.filter((a) => a.handle).length,
        autoCaption: client.autoCaption,
      }}
      topPosts={topPosts.map((p) => ({
        id: p.id,
        // The asset name is the thing an admin recognises; the caption is what
        // Instagram shows. Fall back through both before giving up on a label.
        title: p.asset?.name ?? p.caption ?? "Untitled post",
        platform: p.socialAccount.platform === "INSTAGRAM" ? "IG" : "YT",
        handle: p.socialAccount.handle,
        postedAt: p.postedAt.toISOString(),
        views: p.viewCount,
        permalink: p.permalink,
      }))}
      postsSyncedAt={
        topPosts[0]?.socialAccount.lastSyncedAt?.toISOString() ?? null
      }
      seats={client.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        // The role for *this* client, not the account's original one — the same person
        // can be an owner here and a viewer elsewhere.
        role: m.role,
        lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
        projectAccess: m.user.projectMemberships.map((pm) => ({ projectId: pm.projectId, role: pm.role })),
      }))}
      projects={client.projects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        deliveredAt: p.deliveredAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        type: p.type,
        paymentHold: p.paymentHold,
        assetCount: p.assets.filter((a) => !a.internal).length,
        inboxPath: inboxDirFor(client.username, p.inboxSlug),
      }))}
      intake={{
        // The batch is the unit: one named folder per session, which is how it lands on
        // disk and how anybody talks about it ("Xavier's Tuesday drop").
        batches: client.uploadBatches
          .filter((b) => b.submissions.length > 0)
          .map((b) => {
            const complete = b.submissions.filter((s) => s.status === "COMPLETE").length;
            return {
              id: b.id,
              name: b.name,
              uploaderName: b.user?.name ?? b.senderName ?? "Someone",
              via: b.requestId ? ("send link" as const) : ("portal" as const),
              fileCount: b.submissions.length,
              completeCount: complete,
              receivedBytes: String(b.submissions.reduce((n, s) => n + Number(s.receivedBytes), 0)),
              kinds: [
                ...new Set(
                  b.submissions
                    .map((s) => s.filename.split(".").pop()?.toUpperCase() ?? "")
                    .filter(Boolean)
                ),
              ].slice(0, 4),
              status: b.filesDeletedAt
                ? ("FILES_DELETED" as const)
                : complete < b.submissions.length
                  ? ("RECEIVING" as const)
                  : ("ON_SERVER" as const),
              // What somebody pastes into Finder. The container sees /media/_submissions;
              // a person needs the share it is mounted as.
              smbPath: `smb://mainsqueeze/_submissions/${client.username}/${b.name}/`,
              createdAt: b.createdAt.toISOString(),
            };
          }),
        links: client.submissionRequests.map((r) => ({
          id: r.id,
          name: r.name,
          state: stateOf(r),
          sendPath: `/send/${slugify(client.username)}/${slugify(r.name)}-${r.token}`,
        })),
      }}
    />
  );
}
