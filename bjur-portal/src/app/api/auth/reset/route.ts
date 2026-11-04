import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { completePasswordReset, MIN_PASSWORD } from "@/lib/passwordReset";

/** Choose a new password from an emailed link, and sign in with it. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";

  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`reset:${ip}`, 10, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many tries. Try again shortly." }, { status: 429 });
  }

  const result = await completePasswordReset(token, password);
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.error === "short"
            ? `Use at least ${MIN_PASSWORD} characters.`
            : "This link has expired or was already used. Ask for a new one from the sign in page.",
        expired: result.error === "expired",
      },
      { status: 400 }
    );
  }

  await createSession(result.userId, {
    device: req.headers.get("user-agent") ?? "Unknown device",
    ip: ip !== "local" ? ip : undefined,
    activeClientId: result.activeClientId,
  });
  await db.user.update({ where: { id: result.userId }, data: { lastLoginAt: new Date() } });

  return NextResponse.json({ ok: true });
}
