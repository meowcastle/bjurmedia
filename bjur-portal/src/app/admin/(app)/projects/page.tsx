import { db } from "@/lib/db";
import { inboxDirFor } from "@/lib/projects";
import { AdminProjectsClient } from "@/components/AdminProjectsClient";

export default async function AdminProjectsPage() {
  const [projects, clients] = await Promise.all([
    db.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: true, assets: { select: { id: true, internal: true } } },
    }),
    db.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AdminProjectsClient
      projects={projects.map((p) => ({
        id: p.id,
        title: p.title,
        clientName: p.client.name,
        clientType: p.client.type,
        status: p.status,
        deliveredAt: p.deliveredAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        assetCount: p.assets.filter((a) => !a.internal).length,
        inboxPath: inboxDirFor(p.client.username, p.inboxSlug),
      }))}
      clients={clients.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
    />
  );
}
