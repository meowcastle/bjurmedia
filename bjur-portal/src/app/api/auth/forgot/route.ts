import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { postSlackEvent } from "@/lib/slack";
import { requestPasswordReset } from "@/lib/passwordReset";

/**
 * A client saying "I can't get in": emails them a link to choose a new password
 * (lib/passwordReset.ts), and tells the studio on Slack.
 *
 * The response is identical whether or not the address belongs to an account, gets a
 * link, or is over its limit. Saying "no such user" here would hand an unauthenticated
 * caller a way to enumerate the client list, which is the same reason the login route
 * fails a deactivated account exactly like a wrong password.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const next = typeof body.next === "string" ? body.next : null;

  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const { allowed } = rateLimit(`forgot:${ip}`, 5, 15 * 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const result = await requestPasswordReset(email, next).catch((err) => {
    console.error("[forgot] reset request failed", err);
    return null;
  });

  // Only about real logins: alerting on typos and probes would train the studio to
  // ignore the channel.
  if (result?.outcome === "sent" || result?.outcome === "ineligible") {
    const { user } = result;
    const text =
      result.outcome === "sent"
        ? `:key: *Password reset link sent*\n${user.name}\n${user.email}`
        : `:key: *Password reset asked for, no link sent*\n${user.name}\n${user.email}\n:warning: ${
            result.user.isAdmin ? "Studio login: reset it from the admin." : "This login cannot sign in (deactivated, or no active client)."
          }`;
    await postSlackEvent({ blocks: [{ type: "section", text: { type: "mrkdwn", text } }] }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
