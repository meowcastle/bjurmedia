import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await db.session.findUnique({ where: { id: sessionId } });
  if (!target || target.userId !== session.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.session.delete({ where: { id: sessionId } });
  return NextResponse.json({ ok: true });
}
