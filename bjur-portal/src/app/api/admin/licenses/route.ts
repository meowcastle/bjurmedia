import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { composeCustomScope, computeExpiresAt } from "@/lib/licensing";
import { postSlackEvent } from "@/lib/slack";
import { sendLicenseReceipt } from "@/lib/clientMail";

/**
 * Admin-granted enterprise license — the negotiated-deal counterpart to the
 * client self-serve tiers in /api/licenses. Deliberately does NOT block a
 * second license on the same asset+client the way the self-serve route does:
 * that check exists to stop an accidental double-charge through the UI, but a
 * negotiated deal legitimately needs a new record on renewal/renegotiation.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    assetId,
    userId,
    termMonths,
    territory,
    channels,
    exclusive,
    amount,
  } = body as {
    assetId: string;
    userId: string;
    termMonths: number | null;
    territory: string | null;
    channels: string[];
    exclusive: boolean;
    amount: number;
  };

  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: { project: { include: { client: true } } },
  });
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!asset.licensable || asset.basePrice == null) {
    return NextResponse.json({ error: "This asset isn't licensable." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.clientId !== asset.project.clientId) {
    return NextResponse.json({ error: "Select a valid seat for this client." }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }

  const purchasedAt = new Date();
  const cleanChannels = Array.isArray(channels) ? channels : [];
  const scope = composeCustomScope({
    termMonths: termMonths || null,
    territory: territory || null,
    channels: cleanChannels,
    exclusive: !!exclusive,
  });
  const expiresAt = computeExpiresAt(purchasedAt, termMonths || null);

  const license = await db.license.create({
    data: {
      assetId,
      clientId: asset.project.clientId,
      userId,
      tier: "CUSTOM",
      amount: Math.round(amount),
      scope,
      purchasedAt,
      termMonths: termMonths || null,
      territory: territory?.trim() || null,
      channels: cleanChannels.length > 0 ? JSON.stringify(cleanChannels) : null,
      exclusive: !!exclusive,
      expiresAt,
    },
  });

  // Email #6. Fire-and-forget by design: a receipt that fails must not roll back a
  // license the client already holds.
  await sendLicenseReceipt(license.id);

  await db.activity.create({
    data: {
      actor: "You",
      action: `granted a custom license for "${asset.name}" to ${asset.project.client.name} (${user.name}) — ${scope} — $${license.amount}`,
    },
  });

  await postSlackEvent({
    clientId: asset.project.clientId,
    toggle: "autoLicense",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:moneybag: *${asset.project.client.name}* — custom enterprise license granted\n*${asset.name}* — ${scope} — *$${license.amount}*`,
        },
      },
    ],
  });

  return NextResponse.json({ ok: true, license });
}
