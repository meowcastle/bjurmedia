import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addSeat } from "@/lib/clients";
import { sendOnboardingEmail } from "@/lib/mailer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, email, role, projectAccess } = await req.json();
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (!["OWNER", "DOWNLOADER", "VIEWER"].includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  let validatedAccess: { projectId: string; role: "OWNER" | "DOWNLOADER" | "VIEWER" }[] | undefined;
  if (Array.isArray(projectAccess) && projectAccess.length > 0) {
    for (const p of projectAccess) {
      if (typeof p?.projectId !== "string" || !["OWNER", "DOWNLOADER", "VIEWER"].includes(p?.role)) {
        return NextResponse.json({ error: "Invalid project access." }, { status: 400 });
      }
    }
    const projects = await db.project.findMany({
      where: { id: { in: projectAccess.map((p: { projectId: string }) => p.projectId) }, clientId },
      select: { id: true },
    });
    if (projects.length !== projectAccess.length) {
      return NextResponse.json({ error: "One or more projects don't belong to this client." }, { status: 400 });
    }
    validatedAccess = projectAccess;
  }

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  const { user, tempPassword } = await addSeat({
    clientId,
    name: name.trim(),
    email: email.trim(),
    role,
    projectAccess: validatedAccess,
  });

  await db.activity.create({
    data: { actor: "You", action: `added ${user.name} (${role.toLowerCase()}) to ${client.name}` },
  });

  await sendOnboardingEmail(email.trim(), {
    clientName: client.name,
    recipientName: name.trim(),
    portalUrl: process.env.PORTAL_URL ?? "https://portal.bjur.media",
    username: client.username,
    tempPassword,
  });

  return NextResponse.json({ user, tempPassword });
}
