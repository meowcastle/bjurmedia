/**
 * Drives the CRM agents (src/lib/crm/agents.ts) with the drafter faked and the clock fixed.
 *
 * The prose is not under test. The rules are: one stall makes one draft; nobody marked do
 * not contact is ever drafted to; a payment nudge never auto-sends; the daily cap holds;
 * no amount ever reaches the drafter; the Monday brief posts once, on Monday, in New York
 * time. Run by e2e/crm.spec.ts. Prints one JSON line of results.
 */
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

bootstrapHarnessDb();

const results: CheckResult[] = [];
const check = makeChecker(results);
const DAY = 86_400_000;

async function main() {
  const { db } = await import("../src/lib/db");
  const { draftStalledFollowUps, postWeeklyDigest, sendApprovedDrafts, autoSendKinds, plainDigest } = await import(
    "../src/lib/crm/agents"
  );

  const seen: Record<string, unknown>[] = [];
  const drafter = {
    outreach: async (input: Record<string, unknown>) => {
      seen.push(input);
      return { subject: `About ${input.dealTitle}`, body: `Hi ${input.recipientName}, ${input.trigger}` };
    },
    digest: async () => "BRIEF FROM DRAFTER",
  };
  const now = new Date("2026-10-19T13:30:00Z"); // Monday 09:30 in New York
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  await db.agentConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const client = await db.client.create({ data: { name: "CrmCo", username: "crmco" } });
  const owner = await db.user.create({ data: { name: "Olive Owner", email: "olive@crmco.test", passwordHash: "x" } });
  await db.clientMember.create({ data: { userId: owner.id, clientId: client.id, role: "OWNER" } });
  const ownerContact = await db.contact.create({ data: { name: "Olive Owner", email: "olive@crmco.test", clientId: client.id, userId: owner.id } });

  const lead = await db.contact.create({ data: { name: "Quinn Quote", email: "quinn@lead.test" } });
  const blocked = await db.contact.create({ data: { name: "Nora Never", email: "nora@lead.test", doNotContact: true } });

  const quoted = await db.deal.create({ data: { title: "Spring promo", contactId: lead.id, stage: "QUOTED", stageChangedAt: ago(6), amount: 4800 } });
  const freshQuote = await db.deal.create({ data: { title: "Fresh quote", contactId: lead.id, stage: "QUOTED", stageChangedAt: ago(3) } });
  const blockedQuote = await db.deal.create({ data: { title: "Blocked quote", contactId: blocked.id, stage: "QUOTED", stageChangedAt: ago(9) } });

  const heldProject = await db.project.create({ data: { clientId: client.id, title: "Held film", path: "crm/h", inboxSlug: "crm-h", paymentHold: true } });
  const unpaid = await db.deal.create({ data: { title: "Held film", clientId: client.id, projectId: heldProject.id, stage: "DELIVERED", stageChangedAt: ago(8) } });

  const olderPaid = await db.deal.create({ data: { title: "Old job", clientId: client.id, stage: "PAID", stageChangedAt: ago(60), createdAt: ago(90) } });

  // ---- follow-up agent ----
  const r1 = await draftStalledFollowUps({ now, drafter });
  const drafts = await db.agentDraft.findMany({ orderBy: { createdAt: "asc" } });
  const byDeal = (id: string) => drafts.filter((d) => d.dealId === id);

  check("a quote quiet for 6 days gets one follow-up", byDeal(quoted.id).length === 1 && byDeal(quoted.id)[0].kind === "FOLLOW_UP", JSON.stringify(byDeal(quoted.id).map((d) => d.kind)));
  check("…addressed to its contact", byDeal(quoted.id)[0]?.toEmail === "quinn@lead.test");
  check("a quote only 3 days old is left alone", byDeal(freshQuote.id).length === 0);
  check("someone marked do not contact is never drafted to", byDeal(blockedQuote.id).length === 0);
  check("an unpaid delivery past 7 days gets a payment nudge", byDeal(unpaid.id)[0]?.kind === "PAYMENT_NUDGE");
  check("…sent to the client's owner when the deal has no contact", byDeal(unpaid.id)[0]?.contactId === ownerContact.id);
  check("paid work with newer work after it gets no next-step note", byDeal(olderPaid.id).length === 0);
  check("no amount ever reaches the drafter", seen.every((s) => !JSON.stringify(s).includes("4800")), JSON.stringify(seen));
  check("every draft keeps the context it was written from", drafts.every((d) => d.context != null));
  check("drafts start pending", drafts.every((d) => d.state === "PENDING"));

  const r2 = await draftStalledFollowUps({ now: new Date(now.getTime() + 60_000), drafter });
  check("one stall makes one draft, not one per tick", r2.drafted === 0 && (await db.agentDraft.count()) === drafts.length, JSON.stringify({ r1, r2 }));

  // A paid job with nothing after it, 15 days on: worth a note.
  const latestPaid = await db.deal.create({ data: { title: "Latest job", clientId: client.id, stage: "PAID", stageChangedAt: ago(15) } });
  await draftStalledFollowUps({ now, drafter });
  check("the client's latest paid work gets a next-step note", (await db.agentDraft.findFirst({ where: { dealId: latestPaid.id } }))?.kind === "NEXT_STEP");

  // Without a drafter, or when it fails, the stall becomes a task instead of vanishing.
  const noKey = await db.deal.create({ data: { title: "No key quote", contactId: lead.id, stage: "QUOTED", stageChangedAt: ago(7) } });
  await draftStalledFollowUps({ now, drafter: null });
  const task = await db.task.findFirst({ where: { dealId: noKey.id } });
  check("with no drafter, a stall becomes an agent task", task?.source === "AGENT" && task.title.includes("No key quote"), task?.title);
  const failing = await db.deal.create({ data: { title: "Failing quote", contactId: lead.id, stage: "QUOTED", stageChangedAt: ago(7) } });
  await draftStalledFollowUps({
    now,
    drafter: { ...drafter, outreach: async () => { throw new Error("model down"); } },
  });
  check("a failed draft becomes a task too", (await db.task.count({ where: { dealId: failing.id } })) === 1);

  // ---- sender ----
  check("a garbled autoSendKinds is read as none", autoSendKinds("").size === 0 && autoSendKinds({}).size === 0);
  check("money kinds can never be auto-send", !autoSendKinds(["PAYMENT_NUDGE", "FOLLOW_UP"]).has("PAYMENT_NUDGE"));

  const followUp = byDeal(quoted.id)[0];
  const nudge = byDeal(unpaid.id)[0];
  await db.agentDraft.update({ where: { id: followUp.id }, data: { state: "APPROVED", approvedAt: now } });
  await db.agentConfig.update({ where: { id: 1 }, data: { autoSendKinds: ["PAYMENT_NUDGE", "NEXT_STEP"], maxSendsPerDay: 2 } });

  const s1 = await sendApprovedDrafts({ now });
  const after = async (id: string) => (await db.agentDraft.findUniqueOrThrow({ where: { id } })).state;
  check("an approved draft is sent", (await after(followUp.id)) === "SENT", await after(followUp.id));
  check("a payment nudge stays pending even when listed as auto-send", (await after(nudge.id)) === "PENDING");
  check("a promoted kind is sent without a click", (await db.agentDraft.findFirstOrThrow({ where: { dealId: latestPaid.id } })).state === "SENT");
  check("the daily cap holds", s1.sent === 2, JSON.stringify(s1));
  check("every send is written to Activity", (await db.activity.count({ where: { actor: "Agent", action: { contains: "would send" } } })) === 2);

  const extra = await db.agentDraft.create({ data: { kind: "FOLLOW_UP", toEmail: "x@y.test", body: "hi", state: "APPROVED" } });
  const s2 = await sendApprovedDrafts({ now });
  check("…and keeps holding: nothing more today", s2.sent === 0 && (await after(extra.id)) === "APPROVED", JSON.stringify(s2));

  await db.agentConfig.update({ where: { id: 1 }, data: { maxSendsPerDay: 10 } });
  const toBlocked = await db.agentDraft.create({ data: { kind: "FOLLOW_UP", toEmail: "nora@lead.test", body: "hi", contactId: blocked.id, state: "APPROVED" } });
  await sendApprovedDrafts({ now });
  check("an approved draft to someone marked do not contact is dismissed, not sent", (await after(toBlocked.id)) === "DISMISSED");

  // ---- Monday brief ----
  const sunday = new Date("2026-10-18T14:00:00Z");
  check("no brief on a Sunday", !(await postWeeklyDigest({ now: sunday, drafter })).posted);
  const early = new Date("2026-10-19T12:30:00Z"); // 08:30 in New York, 12:30 UTC
  check("not before 09:00 New York time, even though it is past 09:00 UTC", !(await postWeeklyDigest({ now: early, drafter })).posted);
  const d1 = await postWeeklyDigest({ now, drafter });
  check("the brief posts on Monday at 09:30 New York time", d1.posted && d1.text === "BRIEF FROM DRAFTER");
  check("…and only once that week", !(await postWeeklyDigest({ now: new Date(now.getTime() + 3_600_000), drafter })).posted);
  const plain = plainDigest({
    weekOf: "Oct 19, 2026",
    pipeline: [{ stage: "QUOTED", count: 2, titles: [] }],
    unpaid: [{ title: "Held film", client: "CrmCo", days: 8 }],
    tasksDue: [],
    pendingDrafts: 1,
    cutsAwaiting: [],
  });
  check("without a model the brief is the plain facts", plain.includes("Unpaid: Held film (CrmCo), 8 days") && plain.includes("1 draft waiting"), plain);

  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err) }]));
  process.exit(0);
});
