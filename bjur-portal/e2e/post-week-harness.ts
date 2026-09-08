/**
 * Drives the manual post-week path against a throwaway database with only the Slack
 * HTTP call injected. A live webhook would post into a real workspace, which is
 * precisely the accident the preview step exists to prevent.
 *
 * Run by e2e/post-week.spec.ts. Prints one JSON line of results.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "bjur-post-week-")));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
// Nothing here should reach a real webhook or mail server.
delete process.env.SLACK_WEBHOOK_URL;
process.env.DELIVERY_EMAILS = "off";

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  stdio: "pipe",
});

import type { SlackSender } from "../src/lib/postWeek";

const results: { name: string; pass: boolean; detail?: string }[] = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

/**
 * Exercises the manual post-week path against a throwaway database.
 *
 * Only the Slack HTTP call is injected; the gating, the ordering and the stamping are
 * the real code. A live webhook would make this untestable and would post into a real
 * workspace, which is precisely the accident the preview step exists to prevent.
 *
 *   DATABASE_URL="file:/tmp/pw.db" npx tsx scripts/post-week-harness.ts
 */


const MONDAY = new Date("2026-09-07T00:00:00.000Z");
const sent: { channel: string; blocks: unknown[] }[] = [];
const ok: SlackSender = async ({ channel, blocks }) => {
  sent.push({ channel, blocks });
  return { ok: true, status: 200, body: "ok" };
};
const rejects: SlackSender = async () => ({ ok: false, status: 404, body: "no_service" });

async function main() {
  const { db } = await import("../src/lib/db");
  const { previewProjectWeek, postProjectWeek } = await import("../src/lib/postWeek");

  await db.slackConfig.upsert({
    where: { id: 1 },
    create: { id: 1, connected: true, webhookUrl: "https://hooks.invalid/x", defaultChannel: "#studio" },
    update: { connected: true, webhookUrl: "https://hooks.invalid/x", defaultChannel: "#studio" },
  });

  const client = await db.client.create({
    data: { name: "Week Co", username: `week-${Date.now()}` },
  });
  const mk = (title: string, calendar: boolean) =>
    db.project.create({
      data: {
        clientId: client.id,
        title,
        path: `/vol/${title}`,
        inboxSlug: `${title}-${Date.now()}`,
        calendar,
      },
    });
  const board = await mk("Weekly Reels", true);
  const plain = await mk("Brand Film", false);

  let n = 0;
  const asset = (projectId: string, extra: Record<string, unknown> = {}) =>
    db.asset.create({
      data: {
        projectId,
        kind: "VIDEO",
        format: "Reel",
        orientation: "V",
        name: `clip${++n}.mp4`,
        relPath: `x/clip${n}.mp4`,
        sizeBytes: BigInt(1000),
        weekOf: new Date(MONDAY.getTime() + 86_400_000),
        contentTitle: `Post ${n}`,
        caption: "A caption.",
        ...extra,
      },
    });

  // --- eligibility ---------------------------------------------------------
  check("a non-board project has no week", (await previewProjectWeek(plain.id, MONDAY)) === null);
  const off = await postProjectWeek(plain.id, MONDAY, { send: ok });
  check("and refuses to post", !off.ok && off.error === "not-a-calendar-project");

  const empty = await postProjectWeek(board.id, MONDAY, { send: ok });
  check("an empty week posts nothing", !empty.ok && empty.error === "nothing-scheduled");
  check("nothing was sent", sent.length === 0);

  // --- the caption gate ----------------------------------------------------
  const a1 = await asset(board.id);
  const a2 = await asset(board.id, { captionApprovedAt: new Date() });
  const blocked = await postProjectWeek(board.id, MONDAY, { send: ok });
  check("one unapproved caption blocks the week", !blocked.ok && blocked.error === "captions-unapproved");
  check("and says how many", !blocked.ok && blocked.detail === "1 caption not reviewed yet.");
  check("still nothing sent", sent.length === 0);
  check(
    "the blocked post is named, not just counted",
    !blocked.ok && blocked.unapproved?.[0]?.id === a1.id
  );

  // --- a clean week --------------------------------------------------------
  await db.asset.update({ where: { id: a1.id }, data: { captionApprovedAt: new Date() } });
  const good = await postProjectWeek(board.id, MONDAY, { send: ok });
  check("an approved week goes out", good.ok, JSON.stringify(good));
  check("both posts are counted", good.ok && good.posted === 2);
  check("one message, not one per post", sent.length === 1);
  check("to the studio default channel", sent[0]?.channel === "#studio");

  const after = await db.asset.findMany({
    where: { id: { in: [a1.id, a2.id] } },
    select: { publishState: true, postedToSlackAt: true },
  });
  check("posts are stamped POSTED", after.every((a) => a.publishState === "POSTED"));
  check("and carry a posted time", after.every((a) => a.postedToSlackAt !== null));

  // --- idempotency ---------------------------------------------------------
  const twice = await postProjectWeek(board.id, MONDAY, { send: ok });
  check("the same week does not post twice", !twice.ok && twice.error === "nothing-scheduled");
  check("no second message", sent.length === 1);

  // A late addition to a posted week posts on its own, and does not re-send the rest.
  const a3 = await asset(board.id, { captionApprovedAt: new Date() });
  const late = await postProjectWeek(board.id, MONDAY, { send: ok });
  check("a late addition can still go out", late.ok && late.posted === 1, JSON.stringify(late));
  check("without re-sending what already went", sent.length === 2);

  // --- channel override ----------------------------------------------------
  await db.clientChannel.create({ data: { clientId: client.id, channel: "#57-nyc" } });
  const a4 = await asset(board.id, { captionApprovedAt: new Date() });
  await postProjectWeek(board.id, MONDAY, { send: ok });
  check("the client's own channel wins", sent[2]?.channel === "#57-nyc");

  // --- Slack refusing ------------------------------------------------------
  const a5 = await asset(board.id, { captionApprovedAt: new Date() });
  const failed = await postProjectWeek(board.id, MONDAY, { send: rejects });
  check("a rejected post is reported, not swallowed", !failed.ok && failed.error === "slack-rejected");
  const unstamped = await db.asset.findUnique({ where: { id: a5.id } });
  check("and leaves the post unstamped", unstamped?.postedToSlackAt === null);
  check("so it can be retried", (await postProjectWeek(board.id, MONDAY, { send: ok })).ok);

  // --- disconnected --------------------------------------------------------
  await db.slackConfig.update({ where: { id: 1 }, data: { connected: false } });
  const a6 = await asset(board.id, { captionApprovedAt: new Date() });
  const disconnected = await postProjectWeek(board.id, MONDAY, { send: ok });
  check(
    "no Slack connection is its own answer",
    !disconnected.ok && disconnected.error === "slack-not-connected"
  );

  void a2; void a3; void a4; void a6;
  console.log(JSON.stringify(results));
}

main();
