import { db } from "@/lib/db";
import { buildWeeklySlackPost } from "@/lib/slackCalendar";

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
  /** Which studio toggle gates this event. Omit for events that must always be seen —
   *  a client reporting they cannot sign in should not be swallowed by a preference. */
  toggle?: "autoUpload" | "autoDownload" | "autoLicense" | "autoWeekly" | "autoSubmission" | "autoContentCalendar";
}) {
  try {
    const config = await db.slackConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.connected || !config.webhookUrl) return;
    if (opts.toggle && !config[opts.toggle]) return;

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

/**
 * Posts one client's weekly content calendar — the day-by-day block Justin used to
 * hand-type and paste every Sunday. buildWeeklySlackPost() already reproduced that
 * format exactly for the admin "copy" button; this sends it instead of putting it on
 * the clipboard.
 *
 * Looks *forward*: the week starting `weekStart`. That is the opposite of
 * postWeeklyDigest() above, which reports the week just gone (deliveries made,
 * projects expiring). The two are different messages to different audiences and both
 * are meant to exist.
 *
 * Returns what happened so the caller can log it and decide whether to stamp
 * lastPostedAt — a week with nothing scheduled posts nothing at all, rather than
 * sending a client a block of "OPEN" lines every Sunday.
 */
export async function postWeeklyContentCalendar(clientId: string, weekStart: Date) {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const assets = await db.asset.findMany({
    where: {
      internal: false,
      weekOf: { gte: weekStart, lt: weekEnd },
      project: { clientId },
    },
    select: { weekOf: true, contentTitle: true, caption: true, captionYT: true },
    orderBy: { weekOf: "asc" },
  });

  const scheduled = assets.filter((a) => a.contentTitle?.trim() || a.caption?.trim());
  if (scheduled.length === 0) return { posted: false, assets: 0 };

  const text = buildWeeklySlackPost(
    weekStart,
    scheduled.map((a) => ({
      weekOf: a.weekOf!,
      contentTitle: a.contentTitle,
      caption: a.caption,
      captionYT: a.captionYT,
    }))
  );

  const weekLabel = weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });

  await postSlackEvent({
    clientId,
    toggle: "autoContentCalendar",
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Content calendar — week of ${weekLabel}` } },
      { type: "section", text: { type: "mrkdwn", text } },
    ],
  });

  return { posted: true, assets: scheduled.length };
}
