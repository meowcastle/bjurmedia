import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deactivateUser } from "@/lib/users";

/**
 * Removes a staff/admin login: signs them out everywhere and blocks sign-in. Two
 * things it won't do — lock you out of your own session, or empty the admin list
 * and leave the staff surface unreachable.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (userId === session.id) {
    return NextResponse.json(
      { error: "You can't remove your own admin access — ask another admin to do it." },
      { status: 400 }
    );
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || !target.isAdmin || target.deactivatedAt) {
    return NextResponse.json({ error: "Admin not found." }, { status: 404 });
  }

  const remaining = await db.user.count({
    where: { isAdmin: true, deactivatedAt: null, id: { not: userId } },
  });
  if (remaining === 0) {
    return NextResponse.json(
      { error: "This is the last admin — add another before removing this one." },
      { status: 400 }
    );
  }

  await deactivateUser(userId);

  await db.activity.create({
    data: { actor: "You", action: `removed admin ${target.name}` },
  });

  return NextResponse.json({ ok: true });
}
