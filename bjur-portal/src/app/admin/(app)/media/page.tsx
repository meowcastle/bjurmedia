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

  // No auto-selecting projects[0] anymore — arriving with no ?project= param
  // (e.g. the top-nav MEDIA link with no prior context) now shows a
  // grouped-by-client landing picker instead of silently picking a project
  // for you, which was indistinguishable from actually choosing one.
  const selected = projectParam ? (projects.find((p) => p.id === projectParam) ?? null) : null;

  const assets = selected
    ? await db.asset.findMany({
        where: { projectId: selected.id },
        orderBy: { createdAt: "desc" },
        include: { socialPosts: true },
      })
    : [];

  const clientGroups = Object.values(
    projects.reduce<Record<string, { id: string; name: string; projects: { id: string; title: string }[] }>>(
      (acc, p) => {
        const g = (acc[p.clientId] ??= { id: p.clientId, name: p.client.name, projects: [] });
        g.projects.push({ id: p.id, title: p.title });
        return acc;
      },
      {}
    )
  ).sort((a, b) => a.name.localeCompare(b.name));

  const siblingProjects = selected
    ? projects
        .filter((p) => p.clientId === selected.clientId && p.id !== selected.id)
        .map((p) => ({ id: p.id, title: p.title }))
    : [];

  return (
    <AdminMediaClient
      selectedProjectId={selected?.id ?? ""}
      selectedProjectTitle={selected?.title ?? null}
      selectedClientId={selected?.clientId ?? null}
      selectedClientName={selected?.client.name ?? null}
      siblingProjects={siblingProjects}
      clientGroups={clientGroups}
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
        socialPosts: a.socialPosts.map((p) => ({
          id: p.id,
          permalink: p.permalink,
          viewCount: p.viewCount,
        })),
      }))}
    />
  );
}
