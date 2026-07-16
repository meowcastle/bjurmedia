import { db } from "@/lib/db";
import { AdminClientsClient } from "@/components/AdminClientsClient";

export default async function AdminClientsPage() {
  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: {
      users: { orderBy: { createdAt: "asc" } },
      _count: { select: { projects: true } },
    },
  });

  return (
    <AdminClientsClient
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        username: c.username,
        type: c.type,
        status: c.status,
        projectCount: c._count.projects,
        seats: c.users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        })),
      }))}
    />
  );
}
