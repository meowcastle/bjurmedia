import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createClient, slugifyUsername } from "@/lib/clients";
import { sendOnboardingEmail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, username, type, ownerName, ownerEmail } = await req.json();
  if (!name?.trim() || !ownerName?.trim() || !ownerEmail?.trim()) {
    return NextResponse.json(
      { error: "Client name, owner name, and owner email are required." },
      { status: 400 }
    );
  }
  if (type !== "RETAINER" && type !== "ONEOFF") {
    return NextResponse.json({ error: "Invalid client type." }, { status: 400 });
  }

  const finalUsername = (username?.trim() || slugifyUsername(name)).toLowerCase();

  const existingUsername = await db.client.findUnique({ where: { username: finalUsername } });
  if (existingUsername) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }
  // No email collision check: an owner who already has a login is linked to the new
  // client rather than refused. A deactivated account is the exception — reviving
  // someone's access as a side effect of creating a client is not what anyone means.
  const existingEmail = await db.user.findUnique({ where: { email: ownerEmail.toLowerCase() } });
  if (existingEmail?.deactivatedAt) {
    return NextResponse.json(
      { error: "That login was removed. Reinstate it on their existing client first." },
      { status: 409 }
    );
  }

  const { client, tempPassword, linkedExisting } = await createClient({
    name: name.trim(),
    username: finalUsername,
    type,
    ownerName: ownerName.trim(),
    ownerEmail: ownerEmail.trim(),
  });

  await db.activity.create({
    data: {
      actor: "You",
      action: linkedExisting
        ? `created client "${client.name}" and gave ${ownerEmail.trim()} owner access`
        : `created client "${client.name}"`,
    },
  });

  // Only a genuinely new login gets credentials mailed to it.
  if (tempPassword) {
    await sendOnboardingEmail(ownerEmail.trim(), {
      clientName: client.name,
      recipientName: ownerName.trim(),
      portalUrl: process.env.PORTAL_URL ?? "https://portal.bjur.media",
      username: client.username,
      tempPassword,
    });
  }

  return NextResponse.json({ client, tempPassword });
}
