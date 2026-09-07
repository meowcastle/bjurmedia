import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addSeat, reactivateSeat, addExistingUserToClient } from "@/lib/clients";
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

  // Four cases, and the last one is the point of memberships: an email already in the
  // system is no longer a collision, it is someone who works with more than one client.
  const existing = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { clientMemberships: { select: { clientId: true } } },
  });
  const alreadyHere = existing?.clientMemberships.some((m) => m.clientId === clientId) ?? false;

  if (existing && !existing.deactivatedAt && alreadyHere) {
    return NextResponse.json({ error: "That person is already a seat on this client." }, { status: 409 });
  }

  // Linking an existing, active login to another client issues no password and sends no
  // onboarding mail — they already sign in, they are just gaining a second account.
  const linking = !!existing && !existing.deactivatedAt;

  const { user, tempPassword } = linking
    ? { user: await addExistingUserToClient({
        userId: existing!.id,
        clientId,
        role,
        projectAccess: validatedAccess,
      }), tempPassword: null as string | null }
    : existing
      ? await reactivateSeat({
          userId: existing.id,
          clientId,
          name: name.trim(),
          role,
          projectAccess: validatedAccess,
        })
      : await addSeat({
          clientId,
          name: name.trim(),
          email: email.trim(),
          role,
          projectAccess: validatedAccess,
        });

  const reinstating = !!existing && !linking;

  await db.activity.create({
    data: {
      actor: "You",
      action: linking
        ? `gave ${user.name} (${role.toLowerCase()}) access to ${client.name}`
        : reinstating
          ? `reinstated ${user.name} (${role.toLowerCase()}) on ${client.name}`
          : `added ${user.name} (${role.toLowerCase()}) to ${client.name}`,
    },
  });

  // Only when there is actually a new login to hand over. Someone gaining a second
  // client keeps the password they already use, and mailing them a "welcome, here are
  // your credentials" note for an account they have had for months is worse than
  // saying nothing.
  if (tempPassword) {
    await sendOnboardingEmail(email.trim(), {
      clientName: client.name,
      recipientName: name.trim(),
      portalUrl: process.env.PORTAL_URL ?? "https://portal.bjur.media",
      username: client.username,
      tempPassword,
    });
  }

  return NextResponse.json({ user, tempPassword });
}
