import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type ProjectAccessInput = { projectId: string; role: "OWNER" | "DOWNLOADER" | "VIEWER" };

/**
 * Replaces a seat's full project-access set. An empty array reverts the seat
 * to unrestricted (sees every one of the client's projects, at User.role).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: clientId, userId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.clientId !== clientId) {
    return NextResponse.json({ error: "Seat not found." }, { status: 404 });
  }

  const { projectAccess } = (await req.json()) as { projectAccess: ProjectAccessInput[] };
  if (!Array.isArray(projectAccess)) {
    return NextResponse.json({ error: "Invalid project access." }, { status: 400 });
  }
  for (const p of projectAccess) {
    if (typeof p?.projectId !== "string" || !["OWNER", "DOWNLOADER", "VIEWER"].includes(p?.role)) {
      return NextResponse.json({ error: "Invalid project access." }, { status: 400 });
    }
  }

  if (projectAccess.length > 0) {
    const projects = await db.project.findMany({
      where: { id: { in: projectAccess.map((p) => p.projectId) }, clientId },
      select: { id: true },
    });
    if (projects.length !== new Set(projectAccess.map((p) => p.projectId)).size) {
      return NextResponse.json({ error: "One or more projects don't belong to this client." }, { status: 400 });
    }
  }

  await db.$transaction([
    db.projectMember.deleteMany({ where: { userId } }),
    ...(projectAccess.length > 0
      ? [
          db.projectMember.createMany({
            data: projectAccess.map((p) => ({ userId, projectId: p.projectId, role: p.role })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
