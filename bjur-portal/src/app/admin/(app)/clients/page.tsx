import { db } from "@/lib/db";
import { AdminClientsClient } from "@/components/AdminClientsClient";

/**
 * Where a client's logo came from, in words (the "Logo + colour" column). The source is
 * recorded by src/lib/logos as "domain:x", "instagram:@x", "youtube:@x", "brandfetch",
 * "upload" or "seed"; a domain counts as "From email domain" when one of the client's
 * logins signs in from it, otherwise it is the client's website. A seeded logo is named
 * after whichever handle or domain it would have come from.
 */
function logoSourceLabel(c: {
  logoUrl: string | null;
  logoSource: string | null;
  instagramHandle: string | null;
  youtubeHandle: string | null;
  websiteDomain: string | null;
  loginDomains: Set<string>;
}): string {
  if (!c.logoUrl) return "Initials";
  const src = c.logoSource ?? "";
  const domainLabel = (d: string) => (c.loginDomains.has(d.toLowerCase()) ? "From email domain" : "Website");
  if (src.startsWith("instagram:")) return "Instagram";
  if (src.startsWith("youtube:")) return "YouTube";
  if (src.startsWith("domain:")) return domainLabel(src.slice("domain:".length));
  if (src === "brandfetch") return "Brandfetch";
  if (src === "upload") return "Uploaded";
  if (c.instagramHandle) return "Instagram";
  if (c.youtubeHandle) return "YouTube";
  if (c.websiteDomain) return domainLabel(c.websiteDomain);
  if (c.loginDomains.size > 0) return "From email domain";
  return "Uploaded";
}

/** The mono line under a client's name: the handle or domain its logo comes from. */
function handleFor(c: {
  username: string;
  logoSource: string | null;
  instagramHandle: string | null;
  youtubeHandle: string | null;
  websiteDomain: string | null;
}): string {
  const ig = c.instagramHandle ? `@${c.instagramHandle.replace(/^@/, "")}` : null;
  const yt = c.youtubeHandle ? `@${c.youtubeHandle.replace(/^@/, "")}` : null;
  const src = c.logoSource ?? "";
  if (src.startsWith("domain:")) return src.slice("domain:".length);
  if (src.startsWith("youtube:") && yt) return yt;
  // With no handle or domain on file, the login handle, so every row still says who it is.
  return ig ?? yt ?? c.websiteDomain ?? `@${c.username}`;
}

export default async function AdminClientsPage() {
  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: {
      users: { where: { deactivatedAt: null }, orderBy: { createdAt: "asc" } },
      _count: { select: { projects: true } },
    },
  });

  return (
    <AdminClientsClient
      projectTotal={clients.reduce((n, c) => n + c._count.projects, 0)}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        handle: handleFor(c),
        status: c.status,
        logoUrl: c.logoUrl,
        logoColor: c.logoColor,
        logoLocked: c.logoLocked,
        logoSource: logoSourceLabel({
          ...c,
          loginDomains: new Set(c.users.map((u) => u.email.split("@")[1]?.toLowerCase() ?? "").filter(Boolean)),
        }),
        projectCount: c._count.projects,
        loginCount: c.users.length,
      }))}
    />
  );
}
