import { rm } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { inboxDirFor } from "@/lib/projects";

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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await db.project.findUnique({
    where: { id },
    include: { client: true, _count: { select: { assets: true } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only ever allow deleting empty galleries from here — a project with delivered
  // assets needs those handled deliberately, not wiped by a stray click in a list.
  if (project._count.assets > 0) {
    return NextResponse.json(
      { error: "This project has assets — remove them before deleting the project." },
      { status: 400 }
    );
  }

  await db.project.delete({ where: { id } });
  await rm(inboxDirFor(project.client.username, project.inboxSlug), { recursive: true, force: true });

  await db.activity.create({
    data: { actor: "You", action: `deleted project "${project.title}"` },
  });

  return NextResponse.json({ ok: true });
}
