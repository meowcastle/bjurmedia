# Slack integration spec

Posts delivery/activity updates into the studio's Slack. The prototype models this on the
Admin → Integrations → Slack tab. State shape (from the prototype):

```js
slack: {
  channel: '#client-deliveries',   // default/fallback channel
  weeklyDay: 'Monday', weeklyTime: '09:00',
  autoWeekly: true,                // post the weekly calendar
  autoUpload: true,                // post when new work is registered
  autoDownload: false,             // post when a client downloads
  autoLicense: true                // post when a BRAW master is licensed
}
clientChannels: { c1:'#ssh-deliveries', c2:'#57-social', c3:'#suyinsama', c4:'' }
```

Persist as the `SlackConfig` singleton + `ClientChannel` rows (see `ARCHITECTURE.md`).

---

## 1. Connection

- Use a Slack **Incoming Webhook** (simplest for a single self-hosted workspace) — the
  prototype posts as **"Bjur Delivery Bot"**. Store the webhook URL in `SlackConfig.webhookUrl`
  (secret; never expose to the client bundle).
- If you need to post to arbitrary channels by name at runtime (per-client channels), an
  Incoming Webhook is locked to one channel — instead create a Slack **app with a bot token**
  (`chat:write`) and call `chat.postMessage` with the target `channel`. Recommended, since the
  design supports per-client channel overrides.
- "Send test message" button → posts a hello to the default channel and toasts success.
- `connected` gates the whole tab; disconnect clears the token.

**Channel resolution:** for any event tied to a client, post to
`clientChannels[clientId] || slack.defaultChannel`.

---

## 2. Event hooks

Fire these server-side, right after the corresponding DB mutation commits. Each is gated by
its toggle.

| Event | Toggle | Trigger | Channel |
|---|---|---|---|
| **New delivery / registration** | `autoUpload` | Admin registers asset(s) into a project, or worker finishes proxies for a batch | client's channel |
| **Download** | `autoDownload` | A client downloads a file / "Download all" | client's channel |
| **License purchased** | `autoLicense` | A `License` row is created for a BRAW master | client's channel + default |
| **Weekly calendar** | `autoWeekly` | Cron, `weeklyDay` @ `weeklyTime` | default channel |

### Payloads (Block Kit)

New delivery:

```json
{
  "channel": "#ssh-deliveries",
  "username": "Bjur Delivery Bot",
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "📦 New delivery — SSH" } },
    { "type": "section", "text": { "type": "mrkdwn",
      "text": "*Spring Campaign 2026*\n12 files · 3 films, 9 stills · proxies ready" } },
    { "type": "actions", "elements": [
      { "type": "button", "text": { "type": "plain_text", "text": "Open gallery" },
        "url": "https://portal.bjur.media/p/<projectId>" } ] }
  ]
}
```

License purchased:

```json
{
  "channel": "#57-social",
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn",
      "text": ":moneybag: *57.NYC* licensed a BRAW master\n*NYC_Rooftop_MASTER.braw* — Commercial & Broadcast — *$1,000*" } }
  ]
}
```

Download:

```json
{
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn",
      "text": ":arrow_down: *SSH* downloaded 12 files from *Spring Campaign 2026*" } }
  ]
}
```

Keep the message text aligned with the dashboard's activity-feed copy (e.g. "downloaded 12
files from Spring Campaign 2026", "licensed a BRAW master — Commercial & Broadcast") so Slack
and the in-app feed read consistently — write both from the same event emitter.

---

## 3. Weekly calendar (cron)

`autoWeekly` posts a scheduled digest to the default channel on `weeklyDay` at `weeklyTime`
(studio-local time). This is 57.NYC's weekly-cadence workflow surfaced to the team.

- **Scheduling:** a `node-cron` job inside the `web` container (or a Synology **Task
  Scheduler** entry hitting an internal `POST /api/slack/weekly` route). Re-read
  `weeklyDay/weeklyTime` on config change and reschedule.
- **Content:** the week's planned/queued posts and deliveries — e.g. per client, what's
  scheduled to go out, what's newly delivered, what's expiring this week.

```json
{
  "channel": "#client-deliveries",
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "🗓 Week of Jul 13 — delivery calendar" } },
    { "type": "section", "text": { "type": "mrkdwn",
      "text": "*57.NYC — IG Posting*\n• Mon: Rooftop reel 01\n• Wed: FW26 still set\n• Fri: recap film" } },
    { "type": "divider" },
    { "type": "section", "text": { "type": "mrkdwn",
      "text": "*Expiring this week*\n• Halcyon — Brand Anthem (Sep 01)" } }
  ]
}
```

Model the calendar's source data however suits the studio (a lightweight `ScheduledPost`
table, or derive from projects with upcoming `deliveredAt` / `expiresAt`). The prototype only
shows the schedule UI (day + time + toggle); the digest content is yours to define with the
studio.

---

## 4. Security

- Webhook URL / bot token are **server-only secrets** (env or `SlackConfig`, never sent to the
  browser).
- All posting happens server-side; the client never calls Slack directly.
- Failures are non-fatal — log an `Activity` row and move on; never block a delivery/download
  on Slack being reachable.
