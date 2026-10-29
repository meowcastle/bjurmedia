/**
 * CRM Phase 4 (CRM.md Modules 6 and 7) with the drafter faked, the clock fixed and Slack
 * caught by a local server.
 *
 * The rules under test: one nudge per stalled cut, to the right person with the right
 * link; punch lists wait for notes to go quiet and never repeat a note; check-ins and
 * referral asks land once, in their windows, spaced from anything else sent to the same
 * person; idle clients get one standing task; the next-step note no longer repeats.
 * Run by e2e/crm-phase4.spec.ts. Prints one JSON line of results.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

process.env.PORTAL_URL = "https://portal.example.test";
bootstrapHarnessDb();

const results: CheckResult[] = [];
const check = makeChecker(results);
const DAY = 86_400_000;

async function main() {
  const slack: string[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      slack.push(JSON.parse(body).blocks[0].text.text);
      res.end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  const { db } = await import("../src/lib/db");
  const agents = await import("../src/lib/crm/agents");

  const drafter = {
    outreach: async (input: Record<string, unknown>) => ({ subject: `${input.kind} ${input.dealTitle}`, body: `Hi ${input.recipientName}` }),
    digest: async () => "BRIEF",
  };
  const now = new Date("2026-10-29T15:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  await db.agentConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await db.slackConfig.create({
    data: { id: 1, connected: true, webhookUrl: `http://127.0.0.1:${port}/hook`, defaultChannel: "#studio" },
  });

  let n = 0;
  const mkClient = async (name: string) => {
    n += 1;
    const client = await db.client.create({ data: { name, username: `c${n}` } });
    const email = `owner${n}@client.test`;
    const user = await db.user.create({ data: { name: `Owner ${n}`, email, passwordHash: "x" } });
    await db.clientMember.create({ data: { userId: user.id, clientId: client.id, role: "OWNER" } });
    const contact = await db.contact.create({ data: { name: `Owner ${n}`, email, clientId: client.id, userId: user.id } });
    return { client, user, contact, email };
  };
  const mkProject = (clientId: string, title: string, over = {}) =>
    db.project.create({ data: { clientId, title, path: `p/${title}`, inboxSlug: title.toLowerCase().replace(/\W+/g, "-"), ...over } });
  const mkCut = async (projectId: string, sentAt: Date | null, over = {}) => {
    const asset = await db.asset.create({
      data: { projectId, kind: "VIDEO", format: "Film", orientation: "landscape", name: `cut-${Math.random()}.mp4`, relPath: `x/${Math.random()}`, sizeBytes: BigInt(1) },
    });
    return db.review.create({ data: { assetId: asset.id, sentAt, ...over } });
  };

  // ---- Module 6: notes nudges ----
  const band = await mkClient("Band");
  const film = await mkProject(band.client.id, "Tour Film");
  const seat = await db.reviewer.create({ data: { projectId: film.id, kind: "SEAT", userId: band.user.id, email: band.email, name: "Owner Seat" } });
  await db.reviewer.create({ data: { projectId: film.id, kind: "GUEST", email: "guest@label.test", name: "Label Guest", token: "a".repeat(64) } });
  const stalled = await mkCut(film.id, ago(5));
  const fresh = await mkCut(film.id, ago(2));
  const ancient = await mkCut(film.id, ago(40));
  const answered = await mkCut(film.id, ago(6));
  await db.reviewNote.create({ data: { reviewId: answered.id, reviewerId: seat.id, body: "Tighten the intro", timeSec: 12, sentAt: ago(1) } });
  const drafting = await mkCut(film.id, ago(6));
  await db.reviewNote.create({ data: { reviewId: drafting.id, reviewerId: seat.id, body: "half written", sentAt: null } });

  const guestOnly = await mkProject(band.client.id, "Label Cut");
  await db.reviewer.create({ data: { projectId: guestOnly.id, kind: "GUEST", email: "solo@label.test", name: "Solo Guest", token: "b".repeat(64) } });
  const guestCut = await mkCut(guestOnly.id, ago(5));

  const blockedProject = await mkProject(band.client.id, "Blocked Film");
  await db.reviewer.create({ data: { projectId: blockedProject.id, kind: "GUEST", email: "no@thanks.test", name: "No Thanks", token: "c".repeat(64) } });
  await db.contact.create({ data: { name: "No Thanks", email: "no@thanks.test", doNotContact: true } });
  const blockedCut = await mkCut(blockedProject.id, ago(5));

  await agents.draftReviewNudges({ now, drafter });
  const nudges = await db.agentDraft.findMany({ where: { kind: "REVIEW_NUDGE" } });
  const nudgeFor = (email: string) => nudges.filter((d) => d.toEmail === email);
  check("a cut 5 days without notes gets one nudge", nudges.filter((d) => (d.context as { reviewId: string }).reviewId === stalled.id).length === 1);
  check("…to the seat, not the guest", nudgeFor(band.email).length >= 1 && nudgeFor("guest@label.test").length === 0, JSON.stringify(nudges.map((d) => d.toEmail)));
  check("…with the portal review link", nudgeFor(band.email)[0]?.body.endsWith(`/p/${film.id}/review`) === true, nudgeFor(band.email)[0]?.body);
  check("a guest-only project nudges the guest with their own link", nudgeFor("solo@label.test")[0]?.body.endsWith(`/r/${"b".repeat(64)}`) === true);
  check("a cut sent 2 days ago is left alone", !nudges.some((d) => (d.context as { reviewId: string }).reviewId === fresh.id));
  check("a cut sent 40 days ago is history", !nudges.some((d) => (d.context as { reviewId: string }).reviewId === ancient.id));
  check("a cut with sent notes needs no nudge", !nudges.some((d) => (d.context as { reviewId: string }).reviewId === answered.id));
  check("unsent draft notes do not count as notes", nudges.some((d) => (d.context as { reviewId: string }).reviewId === drafting.id));
  check("do-not-contact gets nothing", nudgeFor("no@thanks.test").length === 0);
  check("…but the cut is marked so it is not reconsidered", (await db.review.findUnique({ where: { id: blockedCut.id } }))?.nudgedAt != null);
  check("guest-only cut marked", (await db.review.findUnique({ where: { id: guestCut.id } }))?.nudgedAt != null);

  const before = await db.agentDraft.count();
  await agents.draftReviewNudges({ now: new Date(now.getTime() + 60_000), drafter });
  check("a second run drafts nothing new", (await db.agentDraft.count()) === before);
  // Three days on, the cut that was only 2 days old is due its own nudge, and only it is.
  await agents.draftReviewNudges({ now: new Date(now.getTime() + 3 * DAY), drafter });
  check("…and a cut that comes due later gets its own", (await db.agentDraft.count()) === before + 1);

  const noWords = await mkCut(film.id, ago(5));
  await agents.draftReviewNudges({ now, drafter: null });
  check("without a drafter it becomes a task", (await db.task.count({ where: { title: { startsWith: "Ask Owner Seat for notes" } } })) === 1);
  check("…and the cut is marked", (await db.review.findUnique({ where: { id: noWords.id } }))?.nudgedAt != null);

  // ---- Module 6: punch lists ----
  const round = await mkCut(film.id, ago(3), { nudgedAt: now });
  await db.reviewNote.create({ data: { reviewId: round.id, reviewerId: seat.id, body: "Colour is warm at the end", timeSec: 95, sentAt: hoursAgo(2) } });
  await db.reviewNote.create({ data: { reviewId: round.id, reviewerId: seat.id, body: "Logo earlier", timeSec: 4, sentAt: hoursAgo(2) } });
  const quiet = await mkCut(film.id, ago(3), { nudgedAt: now });
  await db.reviewNote.create({ data: { reviewId: quiet.id, reviewerId: seat.id, body: "Still typing", timeSec: 1, sentAt: hoursAgo(0.2) } });

  slack.length = 0;
  await agents.postPunchLists({ now, drafter });
  const list = slack.find((t) => t.includes("Colour is warm")) ?? "";
  check("notes quiet for an hour become a punch list", list.includes("Punch list:"), slack.join(" | "));
  check("…in timecode order with timecodes", list.indexOf("0:04 Logo earlier") >= 0 && list.indexOf("0:04") < list.indexOf("1:35"), list);
  check("notes sent 12 minutes ago wait", !slack.some((t) => t.includes("Still typing")));
  // `answered` had a note sent a day ago, also quiet: it gets its list too.
  const postedCount = slack.length;

  slack.length = 0;
  await agents.postPunchLists({ now: new Date(now.getTime() + 60_000), drafter });
  check("a note is never listed twice", !slack.some((t) => t.includes("Colour is warm")), slack.join(" | "));

  await db.reviewNote.create({ data: { reviewId: round.id, reviewerId: seat.id, body: "One more: lower the music", timeSec: 50, sentAt: new Date(now.getTime() + 60_000) } });
  slack.length = 0;
  await agents.postPunchLists({ now: new Date(now.getTime() + 2 * 3_600_000), drafter });
  const second = slack.find((t) => t.includes("lower the music")) ?? "";
  check("a later round lists only its own notes", second !== "" && !second.includes("Colour is warm"), second);
  check("first run posted the two quiet cuts", postedCount === 2, String(postedCount));

  // ---- Module 7: repeat business ----
  const a = await mkClient("Alpha");
  const referral = await db.deal.create({ data: { title: "Alpha promo", clientId: a.client.id, stage: "PAID", stageChangedAt: ago(30), closedAt: ago(30) } });
  const b = await mkClient("Bravo");
  const checkIn = await db.deal.create({ data: { title: "Bravo film", clientId: b.client.id, stage: "PAID", stageChangedAt: ago(75), closedAt: ago(75), createdAt: ago(120) } });
  const c = await mkClient("Charlie");
  const superseded = await db.deal.create({ data: { title: "Charlie old", clientId: c.client.id, stage: "PAID", stageChangedAt: ago(75), closedAt: ago(75), createdAt: ago(120) } });
  await db.deal.create({ data: { title: "Charlie new", clientId: c.client.id, stage: "ACTIVE", createdAt: ago(10) } });
  const d = await mkClient("Delta");
  const spaced = await db.deal.create({ data: { title: "Delta promo", clientId: d.client.id, stage: "PAID", stageChangedAt: ago(30), closedAt: ago(30) } });
  await db.agentDraft.create({ data: { kind: "PAYMENT_NUDGE", toEmail: d.email, body: "x", state: "SENT", createdAt: ago(10), dealId: spaced.id } });
  const e = await mkClient("Echo");
  const tooLate = await db.deal.create({ data: { title: "Echo film", clientId: e.client.id, stage: "PAID", stageChangedAt: ago(120), closedAt: ago(120) } });

  await agents.draftRepeatBusiness({ now, drafter });
  const kindsFor = async (id: string) => (await db.agentDraft.findMany({ where: { dealId: id } })).map((x) => x.kind);
  check("paid 30 days ago: one referral ask", JSON.stringify(await kindsFor(referral.id)) === '["REFERRAL_ASK"]', JSON.stringify(await kindsFor(referral.id)));
  check("paid 75 days ago, latest job: one check-in", JSON.stringify(await kindsFor(checkIn.id)) === '["CHECK_IN"]', JSON.stringify(await kindsFor(checkIn.id)));
  check("paid 75 days ago with newer work: nothing", (await kindsFor(superseded.id)).length === 0);
  check("someone drafted to 10 days ago: held back", JSON.stringify(await kindsFor(spaced.id)) === '["PAYMENT_NUDGE"]');
  check("past the 90-day window: nothing", (await kindsFor(tooLate.id)).length === 0);

  const total = await db.agentDraft.count();
  await db.agentDraft.updateMany({ where: { state: "PENDING" }, data: { state: "SENT" } });
  await agents.draftRepeatBusiness({ now: new Date(now.getTime() + 5 * DAY), drafter });
  check("a second run drafts nothing new", (await db.agentDraft.count()) === total, `${total} → ${await db.agentDraft.count()}`);

  // A second paid job for Alpha inside 180 days: no second referral ask.
  const alpha2 = await db.deal.create({ data: { title: "Alpha second", clientId: a.client.id, stage: "PAID", stageChangedAt: ago(25), closedAt: ago(25) } });
  await agents.draftRepeatBusiness({ now: new Date(now.getTime() + 30 * DAY), drafter });
  check("one referral ask per client per 180 days", !(await kindsFor(alpha2.id)).includes("REFERRAL_ASK"), JSON.stringify(await kindsFor(alpha2.id)));

  // ---- Next step no longer repeats ----
  const f = await mkClient("Foxtrot");
  const once = await db.deal.create({ data: { title: "Foxtrot job", clientId: f.client.id, stage: "PAID", stageChangedAt: ago(40), lastNudgedAt: ago(20) } });
  await agents.draftStalledFollowUps({ now, drafter });
  check("next-step note is once per job", !(await kindsFor(once.id)).includes("NEXT_STEP"), JSON.stringify(await kindsFor(once.id)));

  // ---- Idle clients ----
  const g = await mkClient("Golf");
  await db.deal.create({ data: { title: "Golf job", clientId: g.client.id, stage: "PAID", stageChangedAt: ago(200), createdAt: ago(230) } });
  await mkProject(g.client.id, "Golf Project", { createdAt: ago(230) });
  const h = await mkClient("Hotel");
  await db.deal.create({ data: { title: "Hotel job", clientId: h.client.id, stage: "PAID", stageChangedAt: ago(200), createdAt: ago(230) } });
  await mkProject(h.client.id, "Hotel New", { createdAt: ago(20) });
  await agents.addIdleClientTasks({ now });
  await agents.addIdleClientTasks({ now: new Date(now.getTime() + DAY) });
  check("a client quiet for 6 months gets one reconnect task", (await db.task.count({ where: { title: { startsWith: "Reconnect with Golf" } } })) === 1);
  check("a client with a recent project does not", (await db.task.count({ where: { title: { startsWith: "Reconnect with Hotel" } } })) === 0);
  const golfTask = await db.task.findFirst({ where: { title: { startsWith: "Reconnect with Golf" } } });
  await db.task.update({ where: { id: golfTask!.id }, data: { doneAt: now } });
  await agents.addIdleClientTasks({ now: new Date(now.getTime() + 30 * DAY) });
  check("done recently: not re-added", (await db.task.count({ where: { title: { startsWith: "Reconnect with Golf" } } })) === 1);
  await agents.addIdleClientTasks({ now: new Date(now.getTime() + 100 * DAY) });
  check("…until 90 days after it was done", (await db.task.count({ where: { title: { startsWith: "Reconnect with Golf" } } })) === 2);

  server.close();
  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err?.stack ?? err) }]));
  process.exit(0);
});
