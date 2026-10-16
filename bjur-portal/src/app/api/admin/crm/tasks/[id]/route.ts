import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Ticks a task off, or back on. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { done?: unknown };
  if (typeof body.done !== "boolean") return NextResponse.json({ error: "done must be true or false." }, { status: 400 });
  const task = await db.task.update({ where: { id }, data: { doneAt: body.done ? new Date() : null } }).catch(() => null);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ task: { id: task.id, done: task.doneAt !== null } });
}
