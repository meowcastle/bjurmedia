import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deactivateUser } from "@/lib/users";

/**
 * Removes a client seat: signs them out everywhere, blocks sign-in, and drops the
 * seat off the client's list. The row itself is kept so their licenses and uploaded
 * footage keep naming an owner — adding the same email back reinstates this seat.
 */
export async function DELETE(
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
  if (!target || target.clientId !== clientId || target.deactivatedAt) {
    return NextResponse.json({ error: "Seat not found." }, { status: 404 });
  }

  await deactivateUser(userId);

  await db.activity.create({
    data: { actor: "You", action: `removed ${target.name} from ${client.name}` },
  });

  return NextResponse.json({ ok: true });
}
