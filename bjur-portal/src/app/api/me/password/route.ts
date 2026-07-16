import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hashPassword, verifyPassword, revokeOtherSessions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { current, next } = await req.json();
  if (typeof current !== "string" || typeof next !== "string" || next.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: session.id } });
  if (!(await verifyPassword(user.passwordHash, current))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  await db.user.update({
    where: { id: session.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });

  await revokeOtherSessions(session.id);

  return NextResponse.json({ ok: true });
}
