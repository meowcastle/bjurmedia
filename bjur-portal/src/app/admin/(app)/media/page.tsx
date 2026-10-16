import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/format";
import { AdminMediaClient } from "@/components/AdminMediaClient";

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; asset?: string }>;
}) {
  const { project: projectParam, asset: assetParam } = await searchParams;

  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: true },
  });

  // Media is one project's pipeline, reached from that project's page. With no project
  // there is nothing to show, and choosing one is what the Clients page is for.
  const selected = projectParam ? (projects.find((p) => p.id === projectParam) ?? null) : null;
  if (!selected) redirect("/admin/clients");

  const [assets, folders] = await Promise.all([
    selected
      ? db.asset.findMany({
          where: { projectId: selected.id },
          orderBy: { createdAt: "desc" },
          include: { socialPosts: true },
        })
      : Promise.resolve([]),
    selected
      ? db.folder.findMany({
          where: { projectId: selected.id },
          orderBy: { createdAt: "asc" },
          include: { _count: { select: { assets: true } } },
        })
      : Promise.resolve([]),
  ]);

  const siblingProjects = selected
    ? projects
        .filter((p) => p.clientId === selected.clientId && p.id !== selected.id)
        .map((p) => ({ id: p.id, title: p.title }))
    : [];

  return (
    <AdminMediaClient
      initialBoardAssetId={selected && assetParam ? assetParam : null}
      selectedProjectId={selected?.id ?? ""}
      selectedProjectTitle={selected?.title ?? null}
      selectedClientName={selected?.client.name ?? null}
      projectOnBoard={selected?.type === "CALENDAR"}
      siblingProjects={siblingProjects}
      folders={folders.map((f) => ({ id: f.id, name: f.name, assetCount: f._count.assets }))}
      assets={assets.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        format: a.format,
        size: formatBytes(a.sizeBytes),
        sizeBytes: a.sizeBytes.toString(),
        proxyStatus: a.proxyStatus,
        proxyProgress: a.proxyProgress,
        thumbReady: a.thumbRelPath != null,
        transcriptStatus: a.transcriptStatus,
        captionSource: a.captionSource,
        dims: a.dims,
        durationSec: a.durationSec,
        masterCodec: a.masterCodec,
        proxyRes: a.proxyRes,
        relPath: a.relPath,
        reingestCount: a.reingestCount,
        lastReplacedAt: a.lastReplacedAt?.toISOString() ?? null,
        internal: a.internal,
        weekOf: a.weekOf?.toISOString() ?? null,
        folderId: a.folderId,
        contentTitle: a.contentTitle,
        caption: a.caption,
        captionYT: a.captionYT,
        captionApprovedAt: a.captionApprovedAt?.toISOString() ?? null,
        captionEditedBy: a.captionEditedBy,
        captionEditedAt: a.captionEditedAt?.toISOString() ?? null,
        postedToSlackAt: a.postedToSlackAt?.toISOString() ?? null,
        socialPosts: a.socialPosts.map((p) => ({
          id: p.id,
          permalink: p.permalink,
          viewCount: p.viewCount,
        })),
      }))}
    />
  );
}
