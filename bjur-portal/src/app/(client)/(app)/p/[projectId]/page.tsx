import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectDetailClient } from "@/components/ProjectDetailClient";
import { getProjectAccess } from "@/lib/projectAccess";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      folders: { orderBy: { createdAt: "asc" } },
      assets: {
        where: { internal: false },
        orderBy: { createdAt: "asc" },
        include: { socialPosts: { select: { viewCount: true } } },
      },
    },
  });

  if (!project || project.status !== "LIVE") notFound();

  const access = await getProjectAccess(session, project);
  if (!access.allowed) {
    // A reviewer's only grant is the review cycle — no ProjectMember row comes with it —
    // so a restricted login that is on a film's cycle lands here with no delivery access
    // and used to get a 404. The gallery genuinely is not theirs; the cut is. Send them
    // to it rather than to a dead end, which is where a bookmark or an autocompleted URL
    // drops somebody who was only ever given the review link.
    const reviewing =
      session.clientId === project.clientId
        ? await db.reviewer.findFirst({
            where: { projectId, userId: session.id, revokedAt: null },
            select: { id: true },
          })
        : null;
    if (!reviewing || project.type !== "FILM") notFound();
    redirect(`/p/${projectId}/review`);
  }

  const allSocialPosts = project.assets.flatMap((a) => a.socialPosts);
  const totalViews = allSocialPosts.reduce((sum, p) => sum + p.viewCount, 0);
  const totalPosts = allSocialPosts.length;

  const assetIds = project.assets.map((a) => a.id);
  const [favorites] = await Promise.all([
    db.favorite.findMany({ where: { userId: session.id, assetId: { in: assetIds } } }),
  ]);

  return (
    <ProjectDetailClient
      project={{
        id: project.id,
        title: project.title,
        path: project.path,
        clientName: project.client.name,
        deliveredAt: project.deliveredAt?.toISOString() ?? null,
        expiresAt: project.expiresAt?.toISOString() ?? null,
        paymentHold: project.paymentHold,
        folders: project.folders.map((f) => ({ id: f.id, name: f.name })),
      }}
      totalViews={totalViews}
      totalSocialPosts={totalPosts}
      assets={project.assets.map((a) => ({
        id: a.id,
        kind: a.kind,
        format: a.format,
        orientation: a.orientation,
        name: a.name,
        dims: a.dims,
        durationSec: a.durationSec,
        // Serialised: sizeBytes is a BigInt, which does not survive the RSC boundary.
        sizeBytes: a.sizeBytes.toString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        weekOf: a.weekOf?.toISOString() ?? null,
        folderId: a.folderId,
        thumbReady: a.thumbRelPath != null,
        contentTitle: a.contentTitle,
        caption: a.caption,
        publishAt: a.publishAt?.toISOString() ?? null,
        publishIg: a.publishIg,
        publishYt: a.publishYt,
        publishState: a.publishState,
        viewCount: a.socialPosts.length
          ? a.socialPosts.reduce((sum, p) => sum + p.viewCount, 0)
          : null,
      }))}
      initialFavorites={favorites.map((f) => f.assetId)}
      role={access.role}
    />
  );
}
