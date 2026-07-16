import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await db.project.findUnique({ where: { id }, include: { client: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.status === "DRAFT" || body.status === "LIVE") data.status = body.status;
  if (body.deliveredAt !== undefined) {
    data.deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : null;
  }
  if (body.expiresAt !== undefined) {
    if (body.expiresAt && project.client.type === "RETAINER") {
      return NextResponse.json(
        { error: "Retainer clients' galleries are permanent and can't expire." },
        { status: 400 }
      );
    }
    data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  }

  const updated = await db.project.update({ where: { id }, data });

  await db.activity.create({
    data: { actor: "You", action: `updated project "${updated.title}"` },
  });

  return NextResponse.json({ project: updated });
}
