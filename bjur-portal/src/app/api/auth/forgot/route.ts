import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { postSlackEvent } from "@/lib/slack";

/**
 * A client saying "I can't get in". There is no self-serve reset: the studio issues
 * logins by hand, so this tells staff and stops there.
 *
 * The response is identical whether or not the address belongs to an account. Saying
 * "no such user" here would hand an unauthenticated caller a way to enumerate the
 * client list, which is the same reason the login route fails a deactivated account
 * exactly like a wrong password.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const { allowed } = rateLimit(`forgot:${ip}`, 5, 15 * 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429 }
    );
  }

  // Nothing to tell the studio about an address that was never issued a login, and
  // alerting on typos and probes would train them to ignore the channel.
  if (email) {
    const user = await db.user.findUnique({
      where: { email },
      select: { name: true, email: true, deactivatedAt: true, client: { select: { name: true } } },
    });

    if (user) {
      const who = user.client?.name ? `${user.name} · ${user.client.name}` : user.name;
      const note = user.deactivatedAt ? "\n:warning: This login is deactivated." : "";
      await postSlackEvent({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:key: *Password reset requested*\n${who}\n${user.email}${note}`,
            },
          },
        ],
      });
      await db.activity.create({
        data: { actor: user.email, action: "requested a password reset" },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
