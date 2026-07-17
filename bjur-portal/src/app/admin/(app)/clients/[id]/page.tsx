import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { inboxDirFor } from "@/lib/projects";
import { AdminClientDetailClient } from "@/components/AdminClientDetailClient";

export default async function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await db.client.findUnique({
    where: { id },
    include: {
      users: { orderBy: { createdAt: "asc" } },
      projects: {
        orderBy: { createdAt: "desc" },
        include: { assets: { select: { id: true, internal: true } } },
      },
    },
  });
  if (!client) notFound();

  return (
    <AdminClientDetailClient
      client={{
        id: client.id,
        name: client.name,
        username: client.username,
        type: client.type,
        status: client.status,
      }}
      seats={client.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      }))}
      projects={client.projects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        deliveredAt: p.deliveredAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        assetCount: p.assets.filter((a) => !a.internal).length,
        inboxPath: inboxDirFor(client.username, p.inboxSlug),
      }))}
    />
  );
}
