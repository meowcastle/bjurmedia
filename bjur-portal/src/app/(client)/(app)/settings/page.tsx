import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsClient } from "@/components/SettingsClient";

export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const [user, client, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.id } }),
    db.client.findUniqueOrThrow({ where: { id: session.clientId } }),
    db.session.findMany({ where: { userId: session.id }, orderBy: { lastSeenAt: "desc" } }),
  ]);

  return (
    <SettingsClient
      companyName={client.name}
      initialName={user.name}
      initialEmail={user.email}
      initialNotifyDelivery={user.notifyDelivery}
      initialNotifyExpiry={user.notifyExpiry}
      initialSessions={sessions.map((s) => ({
        id: s.id,
        device: s.device,
        location: s.location,
        lastSeenAt: s.lastSeenAt.toISOString(),
        isCurrent: s.id === session.sessionId,
      }))}
    />
  );
}
