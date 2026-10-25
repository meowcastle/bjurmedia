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

  const { name, username, ownerName, ownerEmail } = await req.json();
  if (!name?.trim() || !ownerName?.trim() || !ownerEmail?.trim()) {
    return NextResponse.json(
      { error: "Client name, owner name, and owner email are required." },
      { status: 400 }
    );
  }

  // The dialog no longer asks for a username: it is a folder name, derived from the
  // client's name, and a clash takes the next free suffix rather than a question nobody
  // creating a client should have to answer. An explicit one is still honoured — and
  // still refused when taken — for anything calling the API directly.
  let finalUsername: string;
  if (username?.trim()) {
    finalUsername = username.trim().toLowerCase();
    if (await db.client.findUnique({ where: { username: finalUsername } })) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
  } else {
    const base = slugifyUsername(name) || "client";
    finalUsername = base;
    for (let n = 2; await db.client.findUnique({ where: { username: finalUsername } }); n++) {
      finalUsername = `${base}${n}`;
    }
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

  // Only a genuinely new login gets credentials mailed to it. A failed send must not
  // turn into an error response: the client exists by now, and the dialog has to say
  // whether the owner actually got their details or needs the password by hand.
  let emailed = false;
  if (tempPassword) {
    try {
      emailed = (
        await sendOnboardingEmail(ownerEmail.trim(), {
          clientName: client.name,
          recipientName: ownerName.trim(),
          portalUrl: process.env.PORTAL_URL ?? "https://portal.bjur.nyc",
          signInEmail: ownerEmail.trim(),
          tempPassword,
        })
      ).sent;
    } catch (err) {
      console.error("[clients] onboarding email failed", err);
    }
  }

  return NextResponse.json({ client, tempPassword, linkedExisting, emailed });
}
