import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folder = await db.folder.findUnique({ where: { id } });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const existing = await db.folder.findUnique({
    where: { projectId_name: { projectId: folder.projectId, name: name.trim() } },
  });
  if (existing && existing.id !== id) {
    return NextResponse.json({ error: "A folder with that name already exists." }, { status: 409 });
  }

  const updated = await db.folder.update({ where: { id }, data: { name: name.trim() } });

  return NextResponse.json({ folder: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folder = await db.folder.findUnique({ where: { id } });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.folder.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
