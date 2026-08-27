import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const existing = await db.folder.findUnique({
    where: { projectId_name: { projectId, name: name.trim() } },
  });
  if (existing) {
    return NextResponse.json({ error: "A folder with that name already exists." }, { status: 409 });
  }

  const folder = await db.folder.create({ data: { projectId, name: name.trim() } });

  return NextResponse.json({ folder });
}
