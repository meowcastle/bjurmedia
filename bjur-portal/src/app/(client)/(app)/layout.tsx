import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { lighten } from "@/lib/color";
import { ClientHeader } from "@/components/ClientHeader";
import { themeScript } from "@/lib/theme";

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

  // A per-client accent overrides the default brand red for this client's portal
  // only — set via the admin client detail page. --accentb (hover shade) is derived
  // rather than stored separately, matching the default accent/accentb pairing.
  const accentVars = client.accentColor
    ? ({
        "--accent": client.accentColor,
        "--accentb": lighten(client.accentColor, 0.18),
      } as React.CSSProperties)
    : undefined;

  return (
    <div style={accentVars}>
      {/* Stamps the theme before first paint. Without it the page renders dark, then
          corrects on hydration — a black flash on every client navigation. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("client") }} />
      <ClientHeader
        clientName={client.name}
        userName={session.name}
        memberships={session.memberships}
        activeClientId={session.clientId}
      />
      {children}
    </div>
  );
}
