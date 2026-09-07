import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const { email, password, portal } = await req.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const limitKey = `login:${ip}:${email.toLowerCase()}`;
  const { allowed } = rateLimit(limitKey, 5, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { clientMemberships: { include: { client: true } } },
  });

  // Client access is now "belongs to at least one active client" rather than "has a
  // clientId" — a seat can hold several memberships, and clientId is no longer the
  // authority on any of them.
  const activeMemberships =
    user?.clientMemberships.filter((m) => m.client.status === "ACTIVE") ?? [];

  // A revoked login fails exactly like a wrong password — no signal that the
  // account exists at all.
  const scopeOk =
    user &&
    !user.deactivatedAt &&
    (portal === "admin" ? user.isAdmin : user.clientMemberships.length > 0);

  if (!user || !scopeOk || !(await verifyPassword(user.passwordHash, password))) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  if (portal === "client" && activeMemberships.length === 0) {
    // Every client they belong to is disabled. Distinct from a bad password, because
    // the credentials were right and the person needs to know why they are stuck.
    return NextResponse.json({ error: "This account has been disabled." }, { status: 403 });
  }

  // Land on a client they can see. Alphabetical so a multi-client seat opens on the
  // same one every time rather than wherever the database happened to order them.
  const landOn = [...activeMemberships].sort((a, b) =>
    a.client.name.localeCompare(b.client.name)
  )[0];

  await createSession(user.id, {
    device: req.headers.get("user-agent") ?? "Unknown device",
    ip: ip !== "local" ? ip : undefined,
    activeClientId: portal === "client" ? landOn?.clientId : undefined,
  });

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return NextResponse.json({ ok: true });
}
