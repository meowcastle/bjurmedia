import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** "Call Adam Friday." A title, an optional date, optionally a deal. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A task needs a title." }, { status: 400 });
  const dueAt = typeof body.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "That date does not read." }, { status: 400 });
  const dealId = typeof body.dealId === "string" && body.dealId ? body.dealId : null;
  const task = await db.task.create({ data: { title, dueAt, dealId } });
  return NextResponse.json({ task: { id: task.id } });
}
