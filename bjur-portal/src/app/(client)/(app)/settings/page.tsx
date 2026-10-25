import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsClient } from "@/components/SettingsClient";
import { AddLogoCard } from "@/components/AddLogoCard";

export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const [user, client, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.id } }),
    db.client.findUniqueOrThrow({ where: { id: session.clientId } }),
    db.session.findMany({ where: { userId: session.id }, orderBy: { lastSeenAt: "desc" } }),
  ]);

  // The card waits for the job's first look (logoCheckedAt) so a brand-new client isn't
  // asked for something we're about to find on our own.
  const askForLogo = !client.logoUrl && client.logoCheckedAt != null;

  return (
    <>
    {askForLogo && <div className="px-4 sm:px-6 md:px-10 pt-8 max-w-[1400px] mx-auto"><AddLogoCard /></div>}
    <SettingsClient
      companyName={client.name}
      role={user.role}
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
    </>
  );
}
