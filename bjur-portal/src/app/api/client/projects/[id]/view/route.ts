import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectAccess } from "@/lib/projectAccess";

/**
 * One open of a project page by a client login ("Viewed N times" on the project, v13 §3).
 * The page sends it once per tab session, so a refresh or a trip into the viewer and back
 * is not another view. Staff opening the page never count.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.clientId || session.isAdmin) return new NextResponse(null, { status: 204 });
  const project = await db.project.findUnique({ where: { id }, select: { id: true, clientId: true, status: true } });
  if (!project || project.status !== "LIVE") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getProjectAccess(session, project)).allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.project.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  return new NextResponse(null, { status: 204 });
}
