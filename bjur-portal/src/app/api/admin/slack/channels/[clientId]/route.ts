import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Returns the stored row (or the effective defaults when there isn't one). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.clientChannel.findUnique({ where: { clientId } });
  return NextResponse.json({
    exists: row !== null,
    channel: row?.channel ?? "",
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    channel?: string;
    autoPostSlack?: boolean;
    autoPostDay?: number;
    autoPostHour?: number;
  };

  const existing = await db.clientChannel.findUnique({ where: { clientId } });

  const data: Record<string, unknown> = {};
  if (body.channel !== undefined) data.channel = body.channel.trim();

  const channelAfter = (data.channel ?? existing?.channel ?? "") as string;

  // The row exists only to override a channel name — the posting schedule that used to
  // live beside it went with the cron — so clearing the name leaves nothing to remember.
  if (!channelAfter) {
    await db.clientChannel.deleteMany({ where: { clientId } });
    return NextResponse.json({ ok: true });
  }

  await db.clientChannel.upsert({
    where: { clientId },
    create: { clientId, channel: channelAfter, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
