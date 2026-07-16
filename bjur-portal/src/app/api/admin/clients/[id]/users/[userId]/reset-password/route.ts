import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resetSeatPassword } from "@/lib/clients";
import { sendOnboardingEmail } from "@/lib/mailer";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: clientId, userId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.clientId !== clientId) {
    return NextResponse.json({ error: "Seat not found." }, { status: 404 });
  }

  const { user, tempPassword } = await resetSeatPassword(userId);

  await db.activity.create({
    data: { actor: "You", action: `reset password for ${user.name} (${client.name})` },
  });

  const { sent } = await sendOnboardingEmail(user.email, {
    clientName: client.name,
    recipientName: user.name,
    portalUrl: process.env.PORTAL_URL ?? "https://portal.bjur.media",
    username: client.username,
    tempPassword,
  });

  return NextResponse.json({ user, tempPassword, emailed: sent });
}
