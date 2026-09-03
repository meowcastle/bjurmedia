import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(Number(n) || 0)));
}

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
    autoPostSlack: row?.autoPostSlack ?? false,
    autoPostDay: row?.autoPostDay ?? 0,
    autoPostHour: row?.autoPostHour ?? 21,
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

  // Partial update: only the keys actually sent are touched, so saving a channel
  // name can't silently reset the posting schedule and vice versa.
  const data: Record<string, unknown> = {};
  if (body.channel !== undefined) data.channel = body.channel.trim();
  if (body.autoPostSlack !== undefined) data.autoPostSlack = body.autoPostSlack;
  if (body.autoPostDay !== undefined) data.autoPostDay = clampInt(body.autoPostDay, 0, 6);
  if (body.autoPostHour !== undefined) data.autoPostHour = clampInt(body.autoPostHour, 0, 23);

  const wantsAutoPost = (data.autoPostSlack ?? existing?.autoPostSlack) === true;
  const channelAfter = (data.channel ?? existing?.channel ?? "") as string;

  // Clearing the channel used to delete the row outright. That was harmless when the
  // row only carried a channel override, but it now also carries this client's posting
  // schedule — dropping it would silently switch their calendar post off. Only remove
  // the row when there is genuinely nothing left to remember.
  if (!channelAfter && !wantsAutoPost) {
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
