import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectDetailClient } from "@/components/ProjectDetailClient";

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
      assets: { where: { internal: false }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!project || project.clientId !== session.clientId || project.status !== "LIVE") notFound();

  const [favorites, licenses] = await Promise.all([
    db.favorite.findMany({
      where: { userId: session.id, assetId: { in: project.assets.map((a) => a.id) } },
    }),
    db.license.findMany({
      where: { clientId: session.clientId, assetId: { in: project.assets.map((a) => a.id) } },
    }),
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
      }}
      assets={project.assets.map((a) => ({
        id: a.id,
        kind: a.kind,
        format: a.format,
        orientation: a.orientation,
        name: a.name,
        dims: a.dims,
        durationSec: a.durationSec,
        licensable: a.licensable,
        basePrice: a.basePrice,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        weekOf: a.weekOf?.toISOString() ?? null,
        thumbReady: a.thumbRelPath != null,
      }))}
      initialFavorites={favorites.map((f) => f.assetId)}
      initialLicensedAssetIds={licenses.map((l) => l.assetId)}
      role={session.role}
    />
  );
}
