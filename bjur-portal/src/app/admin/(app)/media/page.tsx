import { db } from "@/lib/db";
import { formatBytes } from "@/lib/format";
import { AdminMediaClient } from "@/components/AdminMediaClient";

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: projectParam } = await searchParams;

  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: true },
  });

  const selectedId = projectParam ?? projects[0]?.id ?? "";
  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const assets = selected
    ? await db.asset.findMany({ where: { projectId: selected.id }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <AdminMediaClient
      projects={projects.map((p) => ({ id: p.id, title: p.title, clientName: p.client.name }))}
      selectedProjectId={selectedId}
      selectedProjectPath={selected?.path ?? ""}
      assets={assets.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        format: a.format,
        size: formatBytes(a.sizeBytes),
        proxyStatus: a.proxyStatus,
        internal: a.internal,
        licensable: a.licensable,
        basePrice: a.basePrice,
        weekOf: a.weekOf?.toISOString() ?? null,
      }))}
    />
  );
}
