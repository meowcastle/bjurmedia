import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { licenseTiers, type LicenseTierId } from "@/lib/licensing";
import { postSlackEvent } from "@/lib/slack";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session || !session.clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "VIEWER") {
    return NextResponse.json({ error: "Your role can't purchase licenses." }, { status: 403 });
  }

  const { assetId, tier } = (await req.json()) as { assetId: string; tier: LicenseTierId };

  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: { project: { include: { client: true } } },
  });
  if (!asset || asset.project.clientId !== session.clientId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!asset.licensable || asset.basePrice == null) {
    return NextResponse.json({ error: "This asset isn't licensable." }, { status: 400 });
  }

  const existing = await db.license.findFirst({
    where: { assetId, clientId: session.clientId },
  });
  if (existing) {
    return NextResponse.json({ error: "Already licensed." }, { status: 409 });
  }

  const option = licenseTiers(asset.basePrice).find((t) => t.id === tier);
  if (!option) {
    return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
  }

  const license = await db.license.create({
    data: {
      assetId,
      clientId: session.clientId,
      userId: session.id,
      tier: option.id,
      amount: option.amount,
      scope: option.scope,
    },
  });

  await db.activity.create({
    data: {
      actor: asset.project.client.name,
      action: `licensed a BRAW master — ${option.label} — $${option.amount}`,
    },
  });

  await postSlackEvent({
    clientId: session.clientId,
    toggle: "autoLicense",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:moneybag: *${asset.project.client.name}* licensed a BRAW master\n*${asset.name}* — ${option.label} — *$${option.amount}*`,
        },
      },
    ],
  });

  return NextResponse.json({ ok: true, license });
}
