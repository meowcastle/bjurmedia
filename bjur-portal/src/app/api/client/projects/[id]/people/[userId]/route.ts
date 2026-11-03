import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePeople, listProjectPeople, removeProjectPerson } from "@/lib/projectPeople";

/** An owner taking someone they added off this project. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params;
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await db.project.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  if (!project || !(await canManagePeople(session, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const result = await removeProjectPerson(session, project, userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ people: await listProjectPeople(project, session.id) });
}
