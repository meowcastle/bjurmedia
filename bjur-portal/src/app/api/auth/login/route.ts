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

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });

  const scopeOk =
    user &&
    (portal === "admin" ? user.isAdmin : user.clientId !== null);

  if (!user || !scopeOk || !(await verifyPassword(user.passwordHash, password))) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  if (portal === "client") {
    const client = await db.client.findUnique({ where: { id: user.clientId! } });
    if (client?.status === "DISABLED") {
      return NextResponse.json({ error: "This account has been disabled." }, { status: 403 });
    }
  }

  await createSession(user.id, {
    device: req.headers.get("user-agent") ?? "Unknown device",
    ip: ip !== "local" ? ip : undefined,
  });

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return NextResponse.json({ ok: true });
}
