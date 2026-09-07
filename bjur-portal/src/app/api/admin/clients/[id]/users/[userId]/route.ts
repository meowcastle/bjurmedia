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

  const target = await db.user.findUnique({
    where: { id: userId },
    include: { clientMemberships: { select: { clientId: true } } },
  });
  const isMember = target?.clientMemberships.some((m) => m.clientId === clientId) ?? false;
  if (!target || !isMember || target.deactivatedAt) {
    return NextResponse.json({ error: "Seat not found." }, { status: 404 });
  }

  // Remove them from *this* client only. Deactivating the account outright would cut
  // someone off from every other client they work with, which is the obvious way to
  // turn "take Fritz off 57" into "Fritz cannot sign in anywhere".
  await db.clientMember.delete({
    where: { userId_clientId: { userId, clientId } },
  });

  // Their project-level restrictions for this client go too, or re-adding them later
  // silently reinstates access they were not granted this time.
  const clientProjects = await db.project.findMany({ where: { clientId }, select: { id: true } });
  await db.projectMember.deleteMany({
    where: { userId, projectId: { in: clientProjects.map((p) => p.id) } },
  });

  // Only when that was their last client is the login itself worth revoking.
  const remaining = target.clientMemberships.filter((m) => m.clientId !== clientId).length;
  if (remaining === 0) await deactivateUser(userId);

  await db.activity.create({
    data: {
      actor: "You",
      action:
        remaining === 0
          ? `removed ${target.name} from ${client.name}`
          : `removed ${target.name} from ${client.name} (still has access to ${remaining} other client${remaining === 1 ? "" : "s"})`,
    },
  });

  return NextResponse.json({ ok: true });
}
