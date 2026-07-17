import { db } from "@/lib/db";
import { listArchiveDir, archiveRootLabel } from "@/lib/library";
import { AdminLibraryClient } from "@/components/AdminLibraryClient";

export default async function AdminLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: preselectProjectId } = await searchParams;
  const [rootEntries, projects] = await Promise.all([
    listArchiveDir("").catch(() => []),
    db.project.findMany({ orderBy: { createdAt: "desc" }, include: { client: true } }),
  ]);

  return (
    <AdminLibraryClient
      archiveRoot={archiveRootLabel()}
      rootEntries={rootEntries}
      projects={projects.map((p) => ({ id: p.id, title: p.title, clientName: p.client.name }))}
      preselectProjectId={preselectProjectId}
    />
  );
}
