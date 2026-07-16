import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await db.slackConfig.findUnique({ where: { id: 1 } });
  if (!config?.connected || !config.webhookUrl) {
    return NextResponse.json({ error: "Not connected." }, { status: 400 });
  }

  try {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: config.defaultChannel,
        username: "Bjur Delivery Bot",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: ":wave: Test message from the Bjur Media admin panel." },
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Slack responded ${res.status}`);
  } catch (err) {
    return NextResponse.json({ error: `Failed to post: ${(err as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
