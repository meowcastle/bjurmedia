import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectDetailClient } from "@/components/ProjectDetailClient";
import { getProjectAccess, switchToProjectClient } from "@/lib/projectAccess";
import { CountView } from "@/components/CountView";
import { canManagePeople } from "@/lib/projectPeople";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ people?: string }>;
}) {
  const { projectId } = await params;
  const { people } = await searchParams;
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      client: { include: { channel: true } },
      folders: { orderBy: { createdAt: "asc" } },
      assets: {
        where: { internal: false },
        orderBy: { createdAt: "asc" },
        include: { socialPosts: { select: { viewCount: true } } },
      },
    },
  });

  if (!project || project.status !== "LIVE") notFound();

  // Their project, on another of their clients: switch to it and reload, so the header and
  // every check below run under the client the link was for.
  if (await switchToProjectClient(session, project)) redirect(`/p/${projectId}`);

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
  const [favorites, slack] = await Promise.all([
    db.favorite.findMany({ where: { userId: session.id, assetId: { in: assetIds } } }),
    db.slackConfig.findUnique({ where: { id: 1 }, select: { defaultChannel: true } }),
  ]);
  // Named in the note on a locked caption: the channel the week actually went to.
  const slackChannel = project.client.channel?.channel || slack?.defaultChannel || null;

  return (
    <>
      <CountView projectId={project.id} />
      <ProjectDetailClient
        project={{
          id: project.id,
          title: project.title,
          path: project.path,
          clientName: project.client.name,
          deliveredAt: project.deliveredAt?.toISOString() ?? null,
          expiresAt: project.expiresAt?.toISOString() ?? null,
          paymentHold: project.paymentHold,
          slackChannel,
          footageUploads: project.client.footageUploads,
          folders: project.folders.map((f) => ({ id: f.id, name: f.name })),
          viewCount: project.viewCount,
          isFilm: project.type === "FILM",
        }}
        canManagePeople={await canManagePeople(session, project)}
        openPeople={people === "1"}
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
          captionYT: a.captionYT,
          captionSource: a.captionSource,
          transcriptStatus: a.transcriptStatus,
          postedToSlackAt: a.postedToSlackAt?.toISOString() ?? null,
          captionEditedBy: a.captionEditedBy,
          captionEditedAt: a.captionEditedAt?.toISOString() ?? null,
          transcript: a.transcript,
          transcriptSegments: Array.isArray(a.transcriptSegments)
            ? (a.transcriptSegments as { start: number; text: string }[])
            : null,
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
    </>
  );
}
