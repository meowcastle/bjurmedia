import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ClientHeader } from "@/components/ClientHeader";

export default async function ClientAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!session.clientId) notFound(); // staff session hitting the client surface
  if (session.mustChangePassword) redirect("/change-password");

  const client = await db.client.findUnique({ where: { id: session.clientId } });
  if (!client) notFound();

  return (
    <div>
      <ClientHeader clientName={client.name} userName={session.name} />
      {children}
    </div>
  );
}
