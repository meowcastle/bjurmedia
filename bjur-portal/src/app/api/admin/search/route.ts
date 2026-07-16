import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ groups: [] });

  const [clients, projects, assets] = await Promise.all([
    db.client.findMany({
      where: { OR: [{ name: { contains: q } }, { username: { contains: q } }] },
      take: 5,
    }),
    db.project.findMany({
      where: { title: { contains: q } },
      take: 5,
      include: { client: true },
    }),
    db.asset.findMany({
      where: { name: { contains: q } },
      take: 5,
      include: { project: { include: { client: true } } },
    }),
  ]);

  const groups = [
    {
      label: "Clients",
      items: clients.map((c) => ({
        title: c.name,
        sub: `@${c.username}`,
        href: "/admin/clients",
      })),
    },
    {
      label: "Projects",
      items: projects.map((p) => ({
        title: p.title,
        sub: p.client.name,
        href: `/admin/media?project=${p.id}`,
      })),
    },
    {
      label: "Files",
      items: assets.map((a) => ({
        title: a.name,
        sub: `${a.format} · ${a.project.client.name}`,
        href: `/admin/media?project=${a.projectId}`,
      })),
    },
  ].filter((g) => g.items.length > 0);

  return NextResponse.json({ groups });
}
