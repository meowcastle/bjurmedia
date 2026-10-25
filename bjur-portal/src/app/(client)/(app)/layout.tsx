import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ClientHeader } from "@/components/ClientHeader";
import { themeScript } from "@/lib/theme";
import { PortalFoot } from "@/components/ui/PortalFoot";

export default async function ClientAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  // A login with no client memberships has no client portal to render.
  // This used to notFound(), which meant signing in as an admin and then typing the
  // bare hostname (or letting the browser autocomplete to "/") returned a 404 —
  // invisible in a private window, where there is no session cookie at all and
  // middleware redirects to /login instead. Send staff to the surface they do have.
  if (!session.clientId) redirect("/admin");
  if (session.mustChangePassword) redirect("/change-password");

  const client = await db.client.findUnique({
    where: { id: session.clientId },
  });
  if (!client) notFound();

  // v13: shu is the only action colour, so a client's accentColor no longer re-themes
  // their portal. The client shows up as their logo (or initials on its colour) instead.
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Stamps the theme before first paint. Without it the page renders dark, then
          corrects on hydration — a black flash on every client navigation. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("client") }} />
      <ClientHeader
        clientName={client.name}
        logoUrl={client.logoUrl}
        logoColor={client.logoColor}
        footageUploads={client.footageUploads}
        userName={session.name}
        memberships={session.memberships}
        activeClientId={session.clientId}
      />
      <main className="flex-1">{children}</main>
      <PortalFoot />
    </div>
  );
}
