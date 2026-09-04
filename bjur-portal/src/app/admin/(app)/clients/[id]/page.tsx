import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { inboxDirFor } from "@/lib/projects";
import { AdminClientDetailClient } from "@/components/AdminClientDetailClient";

export default async function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await db.client.findUnique({
    where: { id },
    include: {
      users: {
        where: { deactivatedAt: null },
        orderBy: { createdAt: "asc" },
        include: { projectMemberships: { select: { projectId: true, role: true } } },
      },
      projects: {
        orderBy: { createdAt: "desc" },
        include: {
          assets: { select: { id: true, internal: true } },
          _count: { select: { submissions: true } },
        },
      },
    },
  });
  if (!client) notFound();

  // §10c "Top posts · last 30 days". No delta against the previous period: only the
  // current viewCount is stored, so a change figure would have to be invented.
  const since = new Date(new Date().getTime() - 30 * 86_400_000);

  const [socialAccounts, licenses, topPosts] = await Promise.all([
    db.socialAccount.findMany({ where: { clientId: client.id } }),
    db.license.findMany({
      where: { clientId: client.id },
      orderBy: { purchasedAt: "desc" },
      include: { asset: { select: { name: true } }, user: { select: { name: true } } },
    }),
    db.socialPost.findMany({
      where: { socialAccount: { clientId: client.id }, postedAt: { gte: since } },
      orderBy: { viewCount: "desc" },
      take: 5,
      include: {
        socialAccount: { select: { platform: true, handle: true, lastSyncedAt: true } },
        asset: { select: { name: true } },
      },
    }),
  ]);

  return (
    <AdminClientDetailClient
      client={{
        id: client.id,
        name: client.name,
        username: client.username,
        type: client.type,
        status: client.status,
        // A refresh token is what separates "we can read this channel's view counts"
        // from "we can put a video on it".
        ytPublishReady: socialAccounts.some((a) => a.platform === "YOUTUBE" && a.refreshToken != null),
        ytHandle: socialAccounts.find((a) => a.platform === "YOUTUBE")?.handle ?? null,
        approvalRequired: client.approvalRequired,
        approvalAutoHours: client.approvalAutoHours,
        accentColor: client.accentColor,
        logoUrl: client.logoUrl,
      }}
      licenses={licenses.map((l) => ({
        id: l.id,
        assetName: l.asset.name,
        tier: l.tier,
        amount: l.amount,
        scope: l.scope,
        purchasedAt: l.purchasedAt.toISOString(),
        expiresAt: l.expiresAt?.toISOString() ?? null,
        userName: l.user.name,
      }))}
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
      socialAccounts={socialAccounts.map((s) => ({
        platform: s.platform,
        externalId: s.externalId,
        handle: s.handle,
        hasToken: !!s.accessToken,
        lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
        lastSyncError: s.lastSyncError,
      }))}
      seats={client.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        projectAccess: u.projectMemberships.map((m) => ({ projectId: m.projectId, role: m.role })),
      }))}
      projects={client.projects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        deliveredAt: p.deliveredAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        assetCount: p.assets.filter((a) => !a.internal).length,
        submissionCount: p._count.submissions,
        inboxPath: inboxDirFor(client.username, p.inboxSlug),
      }))}
    />
  );
}
