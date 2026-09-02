import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { AdminTeamClient } from "@/components/AdminTeamClient";

export default async function AdminTeamPage() {
  const session = await getSessionUser();

  const admins = await db.user.findMany({
    where: { isAdmin: true, deactivatedAt: null },
    orderBy: { createdAt: "asc" },
  });

  return (
    <AdminTeamClient
      currentUserId={session!.id}
      admins={admins.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
