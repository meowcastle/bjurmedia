import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addProjectPerson, canManagePeople, listProjectPeople } from "@/lib/projectPeople";

/** Who is on this project, for its owners (lib/projectPeople.ts). */
async function gate(id: string) {
  const session = await getSessionUser();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const project = await db.project.findUnique({
    where: { id },
    include: { client: { select: { name: true, logoUrl: true } } },
  });
  // 404 for "not yours" as well as "not there": a project id is not something to confirm.
  if (!project || !(await canManagePeople(session, project))) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { session, project };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate((await params).id);
  if (g.error) return g.error;
  return NextResponse.json({ people: await listProjectPeople(g.project, g.session.id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate((await params).id);
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; email?: unknown; role?: unknown };
  const result = await addProjectPerson(g.session, g.project, {
    name: typeof body.name === "string" ? body.name : "",
    email: typeof body.email === "string" ? body.email : "",
    role: typeof body.role === "string" ? body.role : "",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    name: result.name,
    mailed: result.mailed,
    people: await listProjectPeople(g.project, g.session.id),
  });
}
