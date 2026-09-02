import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAdmin, reactivateAdmin } from "@/lib/users";

/**
 * Creates a staff/admin login. There's no onboarding email for staff — the temp
 * password comes back once, for whoever added them to hand over directly.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, email } = await req.json();
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  // Same reinstatement rule as client seats: a removed admin keeps their row, so
  // re-adding that email brings the original login back.
  const existing = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const reinstating = !!existing?.deactivatedAt && existing.clientId === null;
  if (existing && !reinstating) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  const { user, tempPassword } = reinstating
    ? await reactivateAdmin({ userId: existing!.id, name: name.trim() })
    : await createAdmin({ name: name.trim(), email: email.trim() });

  await db.activity.create({
    data: {
      actor: "You",
      action: reinstating ? `reinstated admin ${user.name}` : `added admin ${user.name}`,
    },
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    tempPassword,
  });
}
