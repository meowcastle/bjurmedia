import { db } from "@/lib/db";
import { buildWeeklySlackPost } from "@/lib/slackCalendar";

/**
 * Push one project's scheduled week to Slack, by hand.
 *
 * Replaces the Sunday cron that posted every client's week automatically. The studio
 * decides when a week is ready, so nothing leaves the building on a timer.
 *
 * Slack is push-only here. Nothing is read back — no reactions, no bot token, no
 * scopes beyond the incoming webhook that already exists. A posted week is therefore
 * terminal: POSTED is the last state calendar work reaches.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeekItem = {
  id: string;
  title: string;
  day: Date;
  /** False until staff sign the caption off. A week cannot go out with one of these. */
  captionApproved: boolean;
  alreadyPosted: boolean;
};

export type WeekPreview = {
  projectTitle: string;
  clientName: string;
  /** Where it will land: the client's channel override, or the studio default. */
  channel: string;
  weekLabel: string;
  items: WeekItem[];
  /** Captions still waiting on staff. Non-empty means the post is refused. */
  unapproved: WeekItem[];
  alreadyPosted: WeekItem[];
};

export function weekLabelOf(weekStart: Date) {
  return weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * What would go out, without sending anything.
 *
 * The admin sees the exact lines and the target channel before committing — posting
 * into a client's own workspace is not something to find out about afterwards.
 */
export async function previewProjectWeek(
  projectId: string,
  weekStart: Date
): Promise<WeekPreview | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      calendar: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });
  if (!project || !project.calendar) return null;

  const [config, override] = await Promise.all([
    db.slackConfig.findUnique({ where: { id: 1 } }),
    db.clientChannel.findUnique({ where: { clientId: project.clientId } }),
  ]);

  const assets = await db.asset.findMany({
    where: {
      projectId,
      internal: false,
      weekOf: { gte: weekStart, lt: new Date(weekStart.getTime() + WEEK_MS) },
    },
    select: {
      id: true,
      name: true,
      contentTitle: true,
      caption: true,
      captionYT: true,
      weekOf: true,
      captionApprovedAt: true,
      postedToSlackAt: true,
    },
    orderBy: { weekOf: "asc" },
  });

  const items: WeekItem[] = assets.map((a) => ({
    id: a.id,
    title: a.contentTitle?.trim() || a.name,
    day: a.weekOf!,
    captionApproved: a.captionApprovedAt !== null,
    alreadyPosted: a.postedToSlackAt !== null,
  }));

  return {
    projectTitle: project.title,
    clientName: project.client.name,
    channel: override?.channel || config?.defaultChannel || "#client-deliveries",
    weekLabel: weekLabelOf(weekStart),
    items,
    unapproved: items.filter((i) => !i.captionApproved && !i.alreadyPosted),
    alreadyPosted: items.filter((i) => i.alreadyPosted),
  };
}

export type PostWeekResult =
  | { ok: true; posted: number; channel: string }
  | {
      ok: false;
      error: "not-a-calendar-project" | "nothing-scheduled" | "captions-unapproved" | "slack-not-connected" | "slack-rejected";
      detail: string;
      unapproved?: WeekItem[];
    };

/** Injectable so the harness can drive the whole path without a live webhook. */
export type SlackSender = (payload: {
  webhookUrl: string;
  channel: string;
  blocks: Record<string, unknown>[];
}) => Promise<{ ok: boolean; status: number; body: string }>;

const httpSender: SlackSender = async ({ webhookUrl, channel, blocks }) => {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, username: "Bjur Delivery Bot", blocks }),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => "") };
};

/**
 * Send it.
 *
 * Unlike postSlackEvent, this reports what happened rather than swallowing it. That
 * function is right for incidental events — a failed "someone downloaded a file" post
 * must never block the download. Here a person pressed a button and is owed an answer,
 * and a webhook that 404s while the UI says "posted" is the worst version of this.
 */
export async function postProjectWeek(
  projectId: string,
  weekStart: Date,
  deps: { send?: SlackSender } = {}
): Promise<PostWeekResult> {
  const send = deps.send ?? httpSender;

  const preview = await previewProjectWeek(projectId, weekStart);
  if (!preview) {
    return {
      ok: false,
      error: "not-a-calendar-project",
      detail: "This project isn't scheduled on the board.",
    };
  }

  const toPost = preview.items.filter((i) => !i.alreadyPosted);
  if (toPost.length === 0) {
    return {
      ok: false,
      error: "nothing-scheduled",
      detail: preview.items.length
        ? "That week has already been posted."
        : "Nothing is scheduled for that week.",
    };
  }

  // The gate: a week goes out only once every caption has been read by a person. AI
  // drafts are the reason this exists — the point of drafting them is to save typing,
  // not to publish unread.
  if (preview.unapproved.length > 0) {
    const n = preview.unapproved.length;
    return {
      ok: false,
      error: "captions-unapproved",
      detail: `${n} caption${n === 1 ? "" : "s"} not reviewed yet.`,
      unapproved: preview.unapproved,
    };
  }

  const config = await db.slackConfig.findUnique({ where: { id: 1 } });
  if (!config?.connected || !config.webhookUrl) {
    return { ok: false, error: "slack-not-connected", detail: "Slack isn't connected." };
  }

  const assets = await db.asset.findMany({
    where: { id: { in: toPost.map((i) => i.id) } },
    select: { weekOf: true, contentTitle: true, caption: true, captionYT: true },
    orderBy: { weekOf: "asc" },
  });

  const text = buildWeeklySlackPost(
    weekStart,
    assets.map((a) => ({
      weekOf: a.weekOf!,
      contentTitle: a.contentTitle,
      caption: a.caption,
      captionYT: a.captionYT,
    }))
  );

  const result = await send({
    webhookUrl: config.webhookUrl,
    channel: preview.channel,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${preview.projectTitle} — week of ${preview.weekLabel}`,
        },
      },
      { type: "section", text: { type: "mrkdwn", text } },
    ],
  });

  if (!result.ok) {
    await db.activity.create({
      data: {
        actor: "Slack",
        action: `Failed to post ${preview.projectTitle} week of ${preview.weekLabel}: ${result.status} ${result.body.slice(0, 120)}`,
      },
    });
    return {
      ok: false,
      error: "slack-rejected",
      detail: `Slack refused the message (${result.status}).`,
    };
  }

  // Stamped only after Slack accepted it. Marking first would leave a week that reads
  // as sent but never arrived, which nobody would think to check.
  const now = new Date();
  await db.asset.updateMany({
    where: { id: { in: toPost.map((i) => i.id) } },
    data: { postedToSlackAt: now, publishState: "POSTED" },
  });

  await db.activity.create({
    data: {
      actor: "Studio",
      action: `posted ${preview.projectTitle} week of ${preview.weekLabel} to ${preview.channel} (${toPost.length} posts)`,
    },
  });

  return { ok: true, posted: toPost.length, channel: preview.channel };
}
