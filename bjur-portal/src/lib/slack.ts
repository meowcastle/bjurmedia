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
  /** Which studio toggle gates this event. Omit for events that must always be seen —
   *  a client reporting they cannot sign in should not be swallowed by a preference. */
  toggle?: "autoUpload" | "autoDownload" | "autoSubmission";
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

