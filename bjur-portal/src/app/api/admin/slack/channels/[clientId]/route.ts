import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { channel } = await req.json();

  if (!channel?.trim()) {
    await db.clientChannel.deleteMany({ where: { clientId } });
    return NextResponse.json({ ok: true });
  }

  await db.clientChannel.upsert({
    where: { clientId },
    create: { clientId, channel: channel.trim() },
    update: { channel: channel.trim() },
  });

  return NextResponse.json({ ok: true });
}
