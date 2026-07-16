import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createProject } from "@/lib/projects";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, title, expiresAt } = await req.json();
  if (typeof clientId !== "string" || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Client and title are required." }, { status: 400 });
  }

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  if (client.type === "RETAINER" && expiresAt) {
    return NextResponse.json(
      { error: "Retainer clients' galleries are permanent and can't expire." },
      { status: 400 }
    );
  }

  const { project, inboxPath } = await createProject({
    clientId,
    title: title.trim(),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  await db.activity.create({
    data: { actor: "You", action: `created project "${project.title}" for ${client.name}` },
  });

  return NextResponse.json({ project, inboxPath });
}
