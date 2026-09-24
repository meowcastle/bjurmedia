import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectDetailClient } from "@/components/ProjectDetailClient";
import { getProjectAccess } from "@/lib/projectAccess";
import { slugify, stateOf } from "@/lib/submissionRequests";

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
      // What the client has sent *us*. Shown beside what we delivered, because on a real
      // job the two halves are the same conversation.
      submissionRequests: {
        orderBy: { createdAt: "desc" },
        include: {
          batches: { include: { submissions: { select: { sizeBytes: true, status: true } } } },
        },
      },
    },
  });

  if (!project || project.status !== "LIVE") notFound();

  const access = await getProjectAccess(session, project);
  if (!access.allowed) notFound();

  const now = new Date();
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
      requests={project.submissionRequests.map((r) => {
        // stateOf takes `now` so the clock is read once per request, above the render.
        const files = r.batches.flatMap((b) => b.submissions).filter((s) => s.status === "COMPLETE");
        return {
          id: r.id,
          name: r.name,
          open: stateOf(r, now) === "open",
          fileCount: files.length,
          // Serialised: BigInt does not survive the RSC boundary.
          totalBytes: String(files.reduce((n, f) => n + f.sizeBytes, BigInt(0))),
          sendPath: `/send/${slugify(project.title)}/${slugify(r.name)}-${r.token}`,
        };
      })}
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
