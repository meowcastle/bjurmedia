import { db } from "@/lib/db";

type SlackBlock = Record<string, unknown>;

async function resolveChannel(clientId?: string | null) {
  if (!clientId) return null;
  const override = await db.clientChannel.findUnique({ where: { clientId } });
  return override?.channel || null;
}

/**
 * Post a Block Kit message for a studio event. Non-fatal by design (SLACK.md §4):
 * a failed post never blocks the delivery/download/license action that triggered it.
 */
export async function postSlackEvent(opts: {
  clientId?: string | null;
  blocks: SlackBlock[];
  toggle: "autoUpload" | "autoDownload" | "autoLicense" | "autoWeekly";
}) {
  try {
    const config = await db.slackConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.connected || !config.webhookUrl || !config[opts.toggle]) return;

    const channel = (await resolveChannel(opts.clientId)) || config.defaultChannel;

    await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, username: "Bjur Delivery Bot", blocks: opts.blocks }),
    });
  } catch (err) {
    await db.activity.create({
      data: { actor: "Slack", action: `Failed to post event: ${(err as Error).message}` },
    });
  }
}

function weekAgo(d: Date) {
  return new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * Builds and posts the weekly delivery-calendar digest (SLACK.md §3): the past week's
 * deliveries grouped by client, plus what's expiring in the coming week. Called both by
 * the /api/slack/weekly cron route (for external schedulers) and the worker's internal
 * day/time check, so the logic lives in one place.
 */
export async function postWeeklyDigest() {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [delivered, expiring] = await Promise.all([
    db.project.findMany({
      where: { status: "LIVE", deliveredAt: { gte: weekAgo(now) } },
      include: { client: true },
      orderBy: { deliveredAt: "asc" },
    }),
    db.project.findMany({
      where: { expiresAt: { gte: now, lte: weekFromNow } },
      include: { client: true },
      orderBy: { expiresAt: "asc" },
    }),
  ]);

  const weekLabel = now.toLocaleDateString("en-US", { month: "short", day: "2-digit" });

  const byClient = new Map<string, { name: string; lines: string[] }>();
  for (const p of delivered) {
    const day = p.deliveredAt!.toLocaleDateString("en-US", { weekday: "short" });
    const entry = byClient.get(p.clientId) ?? { name: p.client.name, lines: [] };
    entry.lines.push(`• ${day}: ${p.title}`);
    byClient.set(p.clientId, entry);
  }

  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: `🗓 Week of ${weekLabel} — delivery calendar` } },
  ];

  if (byClient.size > 0) {
    for (const { name, lines } of byClient.values()) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${name}*\n${lines.join("\n")}` } });
    }
  } else {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "No deliveries in the past week." } });
  }

  if (expiring.length > 0) {
    blocks.push({ type: "divider" });
    const lines = expiring.map(
      (p) =>
        `• ${p.client.name} — ${p.title} (${p.expiresAt!.toLocaleDateString("en-US", { month: "short", day: "2-digit" })})`
    );
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Expiring this week*\n${lines.join("\n")}` } });
  }

  await postSlackEvent({ toggle: "autoWeekly", blocks });

  return { deliveredProjects: delivered.length, expiringProjects: expiring.length };
}
