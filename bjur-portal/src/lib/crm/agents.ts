import { db } from "@/lib/db";
import { postSlackEvent } from "@/lib/slack";
import { sendOutreachEmail } from "@/lib/mailer";
import { watchUrl } from "@/lib/reviewMail";
import {
  claudeCrmDrafter,
  crmDraftingConfigured,
  type CrmDrafter,
  type OutreachKind,
  type PunchListInput,
} from "@/lib/crm/drafter";

/**
 * The CRM's three workers (CRM.md §3–§5), as plain functions the worker polls and the
 * harness drives with a fake clock and a fake drafter.
 *
 * The rules that make it safe are here, in code, not in policy:
 *  - agents only create rows (drafts, tasks); `sendApprovedDrafts` is the only sender;
 *  - a Contact with doNotContact never gets a draft;
 *  - one stall makes one draft (lastNudgedAt), and never a second while one is pending;
 *  - money kinds never auto-send, even if someone lists them in autoSendKinds;
 *  - maxSendsPerDay caps everything that leaves, approved or not;
 *  - mail actually leaves only under DELIVERY_EMAILS=live, like the rest of the portal.
 */

const DAY = 86_400_000;
/** Kinds that mention money. They go out only from APPROVED, whatever the config says. */
const MONEY_KINDS = new Set(["PAYMENT_NUDGE"]);
const STUDIO_TZ = process.env.STUDIO_TZ || "America/New_York";

export type Deps = { now?: Date; drafter?: CrmDrafter | null };

export async function agentConfig() {
  return db.agentConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/** autoSendKinds is JSON a person may edit by hand; anything but an array of strings is []. */
export function autoSendKinds(raw: unknown): Set<string> {
  const list = Array.isArray(raw) ? raw : [];
  return new Set(list.filter((k): k is string => typeof k === "string" && !MONEY_KINDS.has(k)));
}

function daysSince(d: Date, now: Date) {
  return Math.floor((now.getTime() - d.getTime()) / DAY);
}

/** Who a client deal is addressed to when it has no contact of its own: an owner. */
async function recipientFor(deal: { contactId: string | null; clientId: string | null }) {
  if (deal.contactId) {
    return db.contact.findUnique({ where: { id: deal.contactId } });
  }
  if (!deal.clientId) return null;
  const owner = await db.clientMember.findFirst({
    where: { clientId: deal.clientId, role: "OWNER", user: { deactivatedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return null;
  return db.contact.findUnique({ where: { userId: owner.userId } });
}

/**
 * Module 2 — the follow-up agent. For each open deal that has sat in its stage past the
 * threshold (counting from the later of stageChangedAt and lastNudgedAt), one draft for a
 * person to approve. When drafting is unavailable or fails, a task instead: the stall is
 * still surfaced, just without the words.
 */
export async function draftStalledFollowUps(deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const drafter = deps.drafter === undefined ? (crmDraftingConfigured() ? claudeCrmDrafter : null) : deps.drafter;
  const cfg = await agentConfig();

  const deals = await db.deal.findMany({
    where: { stage: { in: ["QUOTED", "DELIVERED", "PAID", "WON"] } },
    include: { project: { select: { title: true, paymentHold: true } }, client: { select: { name: true } } },
  });

  let drafted = 0;
  let tasked = 0;
  for (const deal of deals) {
    const since = deal.lastNudgedAt && deal.lastNudgedAt > deal.stageChangedAt ? deal.lastNudgedAt : deal.stageChangedAt;
    const age = daysSince(since, now);
    const stageAge = daysSince(deal.stageChangedAt, now);

    let kind: OutreachKind | null = null;
    let trigger = "";
    if (deal.stage === "QUOTED" && age >= cfg.quotedStallDays) {
      kind = "FOLLOW_UP";
      trigger = `We sent a quote ${stageAge} days ago and have not heard back.`;
    } else if (deal.stage === "DELIVERED" && deal.project?.paymentHold && age >= cfg.unpaidStallDays) {
      kind = "PAYMENT_NUDGE";
      trigger = `The work was delivered ${stageAge} days ago and the invoice is still open, so the files are still watermarked.`;
    } else if (
      (deal.stage === "PAID" || deal.stage === "WON") &&
      age >= cfg.nextStepDays &&
      // Once per piece of work. It used to come back every nextStepDays for as long as the
      // deal stayed paid; the check-in and referral ask (Module 7) are the later touches.
      !(deal.lastNudgedAt && deal.lastNudgedAt > deal.stageChangedAt)
    ) {
      // Only the client's most recent piece of business: older paid work with newer work
      // after it is not a reason to get in touch.
      const newer = deal.clientId
        ? await db.deal.count({ where: { clientId: deal.clientId, createdAt: { gt: deal.createdAt } } })
        : 0;
      if (newer === 0) {
        kind = "NEXT_STEP";
        trigger = `That work wrapped and was paid for ${stageAge} days ago.`;
      }
    }
    if (!kind) continue;

    // Never a second draft while one for this deal is still waiting on a person.
    const waiting = await db.agentDraft.count({ where: { dealId: deal.id, state: "PENDING" } });
    if (waiting > 0) continue;

    const contact = await recipientFor(deal);
    if (contact?.doNotContact) {
      await db.deal.update({ where: { id: deal.id }, data: { lastNudgedAt: now } });
      continue;
    }

    const context = {
      trigger,
      stage: deal.stage,
      stageAgeDays: stageAge,
      deal: deal.title,
      project: deal.project?.title ?? null,
      client: deal.client?.name ?? null,
      to: contact ? { name: contact.name, email: contact.email } : null,
    };

    let wrote = false;
    if (drafter && contact?.email) {
      try {
        const out = await drafter.outreach({
          kind,
          recipientName: contact.name,
          clientName: deal.client?.name ?? null,
          dealTitle: deal.title,
          projectTitle: deal.project?.title ?? null,
          trigger,
          notes: deal.notes,
        });
        await db.agentDraft.create({
          data: {
            kind,
            toEmail: contact.email,
            subject: out.subject,
            body: out.body,
            context,
            dealId: deal.id,
            contactId: contact.id,
            clientId: deal.clientId,
          },
        });
        wrote = true;
        drafted += 1;
      } catch (err) {
        console.error(`[crm] drafting failed for deal ${deal.id}:`, (err as Error).message);
      }
    }
    if (!wrote) {
      // No words, but the stall is still a thing a person should see this week.
      await db.task.create({
        data: {
          title: `${kind === "PAYMENT_NUDGE" ? "Chase payment" : kind === "FOLLOW_UP" ? "Follow up on quote" : "Check in"}: ${deal.title}${
            contact?.email ? "" : " (no email on file)"
          }`,
          dueAt: now,
          dealId: deal.id,
          contactId: contact?.id ?? null,
          source: "AGENT",
        },
      });
      tasked += 1;
    }
    await db.deal.update({ where: { id: deal.id }, data: { lastNudgedAt: now } });
    await db.activity.create({
      data: {
        actor: "Agent",
        action: wrote
          ? `drafted a ${kind.toLowerCase().replace("_", " ")} for "${deal.title}" — waiting in the inbox`
          : `added a task for "${deal.title}" (${trigger.toLowerCase()})`,
      },
    });
  }
  return { drafted, tasked };
}

/** The weekday and HH:MM in the studio's timezone, not the container's (UTC on the NAS). */
function studioClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TZ,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), time: `${get("hour")}:${get("minute")}` };
}

/**
 * Module 1 — the Monday brief. Once a week, at or after the configured time on the
 * configured day, a short read of the week posted to the studio's Slack channel. Internal
 * and read-only, so it posts without approval. digestSentAt keeps a restart from posting
 * it twice.
 */
export async function postWeeklyDigest(deps: Deps & { force?: boolean } = {}) {
  const now = deps.now ?? new Date();
  const cfg = await agentConfig();
  const clock = studioClock(now);
  const due = clock.weekday === cfg.digestDay && clock.time >= cfg.digestTime;
  const sentThisWeek = cfg.digestSentAt && now.getTime() - cfg.digestSentAt.getTime() < 6 * DAY;
  if (!deps.force && (!due || sentThisWeek)) return { posted: false as const };

  const open = await db.deal.findMany({
    where: { stage: { notIn: ["LOST"] } },
    include: { project: { select: { paymentHold: true } }, client: { select: { name: true } } },
    orderBy: { stageChangedAt: "asc" },
  });
  const stages = ["LEAD", "QUOTED", "ACTIVE", "DELIVERED", "PAID", "WON"] as const;
  const pipeline = stages
    .map((stage) => {
      const inStage = open.filter((d) => d.stage === stage);
      return { stage, count: inStage.length, titles: inStage.slice(0, 5).map((d) => d.title) };
    })
    .filter((s) => s.count > 0);
  const unpaid = open
    .filter((d) => d.stage === "DELIVERED" && d.project?.paymentHold)
    .map((d) => ({ title: d.title, client: d.client?.name ?? null, days: daysSince(d.stageChangedAt, now) }));
  const tasks = await db.task.findMany({
    where: { doneAt: null, dueAt: { lte: new Date(now.getTime() + 7 * DAY) } },
    orderBy: { dueAt: "asc" },
    take: 10,
  });
  const pendingDrafts = await db.agentDraft.count({ where: { state: "PENDING" } });
  const cuts = await db.review.findMany({
    where: { state: "PENDING", sentAt: { not: null, lte: new Date(now.getTime() - cfg.reviewStallDays * DAY) } },
    include: { asset: { select: { project: { select: { title: true } } } } },
    take: 10,
  });

  const input = {
    weekOf: now.toLocaleDateString("en-US", { timeZone: STUDIO_TZ, month: "short", day: "numeric", year: "numeric" }),
    pipeline,
    unpaid,
    tasksDue: tasks.map((t) => ({ title: t.title, due: t.dueAt?.toISOString().slice(0, 10) ?? null })),
    pendingDrafts,
    cutsAwaiting: cuts.map((c) => ({
      title: c.asset.project.title,
      version: c.version,
      days: daysSince(c.sentAt!, now),
    })),
  };

  const drafter = deps.drafter === undefined ? (crmDraftingConfigured() ? claudeCrmDrafter : null) : deps.drafter;
  let text: string;
  try {
    text = drafter ? await drafter.digest(input) : plainDigest(input);
  } catch (err) {
    console.error("[crm] digest drafting failed, posting the plain version:", (err as Error).message);
    text = plainDigest(input);
  }

  await postSlackEvent({ blocks: [{ type: "section", text: { type: "mrkdwn", text } }] });
  await db.agentConfig.update({ where: { id: 1 }, data: { digestSentAt: now } });
  await db.activity.create({ data: { actor: "Agent", action: `posted the Monday brief for the week of ${input.weekOf}` } });
  return { posted: true as const, text };
}

/** The brief without a model: the same facts as plain bullets. */
export function plainDigest(input: Parameters<CrmDrafter["digest"]>[0]) {
  const lines = [`*Week of ${input.weekOf}*`];
  if (input.pendingDrafts) lines.push(`• ${input.pendingDrafts} draft${input.pendingDrafts === 1 ? "" : "s"} waiting in the inbox`);
  for (const u of input.unpaid) lines.push(`• Unpaid: ${u.title}${u.client ? ` (${u.client})` : ""}, ${u.days} days`);
  for (const t of input.tasksDue) lines.push(`• To do: ${t.title}${t.due ? ` (${t.due})` : ""}`);
  for (const c of input.cutsAwaiting) lines.push(`• Cut ${c.version} of ${c.title} waiting on notes for ${c.days} days`);
  if (input.pipeline.length) lines.push(`• Pipeline: ${input.pipeline.map((s) => `${s.count} ${s.stage.toLowerCase()}`).join(", ")}`);
  if (lines.length === 1) lines.push("• Nothing needs you this week.");
  return lines.join("\n");
}

/**
 * The one sender (CRM.md §4). Approved drafts — plus pending ones of a kind a person has
 * promoted to auto-send, never a money kind — go out, at most maxSendsPerDay in any day.
 * A failure is FAILED with its reason, never silent.
 */
export async function sendApprovedDrafts(deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const cfg = await agentConfig();
  const auto = autoSendKinds(cfg.autoSendKinds);
  const live = process.env.DELIVERY_EMAILS === "live";

  const dayStart = new Date(now.getTime() - DAY);
  const sentToday = await db.agentDraft.count({ where: { state: "SENT", sentAt: { gte: dayStart } } });
  let budget = Math.max(0, cfg.maxSendsPerDay - sentToday);
  if (budget === 0) return { sent: 0, held: true };

  const ready = await db.agentDraft.findMany({
    where: {
      OR: [
        { state: "APPROVED" },
        // Promoted kinds skip the click; money kinds can never be in this set.
        ...(auto.size ? [{ state: "PENDING" as const, kind: { in: [...auto] as never[] } }] : []),
      ],
    },
    include: { contact: { select: { doNotContact: true } } },
    orderBy: { createdAt: "asc" },
  });

  let sent = 0;
  for (const d of ready) {
    if (budget === 0) break;
    if (d.state === "PENDING" && MONEY_KINDS.has(d.kind)) continue; // belt and braces
    if (d.contact?.doNotContact) {
      await db.agentDraft.update({ where: { id: d.id }, data: { state: "DISMISSED", dismissedAt: now, error: "Marked do not contact." } });
      continue;
    }
    if (d.channel !== "EMAIL" || !d.toEmail) {
      await db.agentDraft.update({ where: { id: d.id }, data: { state: "FAILED", error: "No email address to send to." } });
      continue;
    }
    try {
      if (live) await sendOutreachEmail(d.toEmail, d.subject ?? "", d.body);
      await db.agentDraft.update({ where: { id: d.id }, data: { state: "SENT", sentAt: now, error: null } });
      await db.activity.create({
        data: {
          actor: "Agent",
          action: `${live ? "sent" : "(dry run — not sent) would send"} "${d.subject ?? d.kind}" to ${d.toEmail}`,
        },
      });
      sent += 1;
      budget -= 1;
    } catch (err) {
      await db.agentDraft.update({ where: { id: d.id }, data: { state: "FAILED", error: (err as Error).message.slice(0, 500) } });
    }
  }
  return { sent, held: false };
}

// ---------------------------------------------------------------------------------------
// Module 6 — review nudges and the punch list (CRM.md §3).

/** How long a cut's notes must sit still before they are rolled into a punch list. */
const PUNCH_LIST_QUIET_MS = 60 * 60 * 1000;
/** Cuts sent longer ago than this are history, not something to chase. */
const REVIEW_NUDGE_MAX_DAYS = 30;

function drafterFor(deps: Deps) {
  return deps.drafter === undefined ? (crmDraftingConfigured() ? claudeCrmDrafter : null) : deps.drafter;
}

/**
 * A sent cut with no notes after reviewStallDays gets one nudge, drafted for a person to
 * approve, to the first seat reviewing it (a guest when there is no seat). One per cut,
 * ever (Review.nudgedAt), whether it became a draft, a task, or nothing.
 */
export async function draftReviewNudges(deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const drafter = drafterFor(deps);
  const cfg = await agentConfig();

  const cuts = await db.review.findMany({
    where: {
      state: "PENDING",
      supersededAt: null,
      nudgedAt: null,
      sentAt: {
        not: null,
        lte: new Date(now.getTime() - cfg.reviewStallDays * DAY),
        gte: new Date(now.getTime() - REVIEW_NUDGE_MAX_DAYS * DAY),
      },
      notes: { none: { sentAt: { not: null } } },
    },
    include: { asset: { select: { projectId: true, project: { select: { title: true, clientId: true, client: { select: { name: true } } } } } } },
  });

  let drafted = 0;
  let tasked = 0;
  for (const cut of cuts) {
    const project = cut.asset.project;
    const reviewers = await db.reviewer.findMany({
      where: { projectId: cut.asset.projectId, revokedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const to = reviewers.find((r) => r.kind === "SEAT") ?? reviewers[0] ?? null;
    const contact = to ? await db.contact.findUnique({ where: { email: to.email } }) : null;
    const deal = await db.deal.findUnique({ where: { projectId: cut.asset.projectId }, select: { id: true } });
    const days = daysSince(cut.sentAt!, now);
    const trigger = `We sent cut ${cut.version} of ${project.title} ${days} days ago and have no notes on it yet.`;

    await db.review.update({ where: { id: cut.id }, data: { nudgedAt: now } });
    if (!to || contact?.doNotContact) continue;

    let wrote = false;
    if (drafter) {
      try {
        const out = await drafter.outreach({
          kind: "REVIEW_NUDGE",
          recipientName: to.name,
          clientName: project.client.name,
          dealTitle: project.title,
          projectTitle: project.title,
          trigger,
          notes: null,
        });
        await db.agentDraft.create({
          data: {
            kind: "REVIEW_NUDGE",
            toEmail: to.email,
            subject: out.subject,
            // The link is added here, not by the model, so it is always the right one.
            body: `${out.body}\n\n${watchUrl(cut.asset.projectId, to)}`,
            context: { trigger, reviewId: cut.id, cut: cut.version, project: project.title, to: { name: to.name, email: to.email } },
            dealId: deal?.id ?? null,
            contactId: contact?.id ?? null,
            clientId: project.clientId,
          },
        });
        wrote = true;
        drafted += 1;
      } catch (err) {
        console.error(`[crm] review nudge drafting failed for cut ${cut.id}:`, (err as Error).message);
      }
    }
    if (!wrote) {
      await db.task.create({
        data: {
          title: `Ask ${to.name} for notes on cut ${cut.version} of ${project.title}`,
          dueAt: now,
          dealId: deal?.id ?? null,
          contactId: contact?.id ?? null,
          source: "AGENT",
        },
      });
      tasked += 1;
    }
    await db.activity.create({
      data: {
        actor: "Agent",
        action: wrote
          ? `drafted a notes nudge for cut ${cut.version} of "${project.title}" — waiting in the inbox`
          : `added a task to ask for notes on cut ${cut.version} of "${project.title}"`,
      },
    });
  }
  return { drafted, tasked };
}

function timecode(sec: number | null) {
  if (sec == null) return null;
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The punch list without a model: every note as written, in timecode order. */
export function plainPunchList(input: PunchListInput) {
  return input.notes.map((n) => `• ${n.at ? `${n.at} ` : ""}${n.body} (${n.reviewer})`).join("\n");
}

/**
 * Once a cut's notes have gone quiet for an hour, the ones not yet listed go to the
 * studio's Slack as a punch list. Internal, so it posts without approval, to the default
 * channel, never a client's own. punchListAt moves to the last note listed, so a later
 * round makes a new list of only its own notes.
 */
export async function postPunchLists(deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const drafter = drafterFor(deps);

  const cuts = await db.review.findMany({
    where: { notes: { some: { sentAt: { gte: new Date(now.getTime() - 14 * DAY) } } } },
    include: {
      notes: { where: { sentAt: { not: null } }, include: { reviewer: { select: { name: true } } } },
      asset: { select: { project: { select: { title: true } } } },
    },
  });

  let posted = 0;
  for (const cut of cuts) {
    const fresh = cut.notes
      .filter((n) => !cut.punchListAt || n.sentAt! > cut.punchListAt)
      .sort((a, b) => (a.timeSec ?? -1) - (b.timeSec ?? -1) || a.createdAt.getTime() - b.createdAt.getTime());
    if (fresh.length === 0) continue;
    const last = new Date(Math.max(...fresh.map((n) => n.sentAt!.getTime())));
    if (now.getTime() - last.getTime() < PUNCH_LIST_QUIET_MS) continue;

    const input: PunchListInput = {
      project: cut.asset.project.title,
      cut: cut.version,
      notes: fresh.map((n) => ({ reviewer: n.reviewer.name, at: timecode(n.timeSec), body: n.body })),
    };
    let list: string;
    try {
      list = drafter?.punchList ? await drafter.punchList(input) : plainPunchList(input);
    } catch (err) {
      console.error("[crm] punch list drafting failed, posting the notes as written:", (err as Error).message);
      list = plainPunchList(input);
    }
    const head = `*Punch list: ${input.project}, cut ${input.cut}* (${fresh.length} note${fresh.length === 1 ? "" : "s"})`;
    await postSlackEvent({ blocks: [{ type: "section", text: { type: "mrkdwn", text: `${head}\n${list}` } }] });
    await db.review.update({ where: { id: cut.id }, data: { punchListAt: last } });
    await db.activity.create({
      data: { actor: "Agent", action: `posted a punch list for cut ${cut.version} of "${input.project}" to Slack` },
    });
    posted += 1;
  }
  return { posted };
}

// ---------------------------------------------------------------------------------------
// Module 7 — repeat business and referrals (CRM.md §3).

/** Nothing new is drafted to someone who had any draft this recently. */
const SPACING_DAYS = 21;
const REFERRAL_WINDOW = [21, 60] as const;
const CHECK_IN_WINDOW = [60, 90] as const;
/** At most one referral ask per client in this long. */
const REFERRAL_EVERY_DAYS = 180;
const IDLE_DAYS = 180;

async function draftedRecently(email: string, now: Date) {
  const n = await db.agentDraft.count({
    where: { toEmail: email, state: { not: "FAILED" }, createdAt: { gte: new Date(now.getTime() - SPACING_DAYS * DAY) } },
  });
  return n > 0;
}

/**
 * For work that is paid for: a referral ask 21–60 days on, while it is fresh, and a
 * check-in 60–90 days on for the client's most recent job. Each at most once per deal,
 * spaced at least 21 days from anything else drafted to the same person, and a referral
 * ask at most once in 180 days per client.
 */
export async function draftRepeatBusiness(deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const drafter = drafterFor(deps);

  const deals = await db.deal.findMany({
    where: { stage: { in: ["PAID", "WON"] } },
    include: {
      project: { select: { title: true } },
      client: { select: { name: true } },
      drafts: { select: { kind: true, state: true } },
      tasks: { select: { title: true } },
    },
  });

  let drafted = 0;
  let tasked = 0;
  for (const deal of deals) {
    const closed = deal.closedAt ?? deal.stageChangedAt;
    const days = daysSince(closed, now);
    const had = new Set(deal.drafts.map((d) => d.kind));
    const tasked_ = (prefix: string) => deal.tasks.some((t) => t.title.startsWith(prefix));
    if (deal.drafts.some((d) => d.state === "PENDING")) continue;

    let kind: "CHECK_IN" | "REFERRAL_ASK" | null = null;
    let trigger = "";
    if (days >= CHECK_IN_WINDOW[0] && days <= CHECK_IN_WINDOW[1] && !had.has("CHECK_IN") && !tasked_("Check in:")) {
      const newer = deal.clientId
        ? await db.deal.count({ where: { clientId: deal.clientId, createdAt: { gt: deal.createdAt } } })
        : 0;
      if (newer === 0) {
        kind = "CHECK_IN";
        trigger = `We finished ${deal.project?.title ?? deal.title} for them about ${Math.round(days / 30)} months ago.`;
      }
    } else if (days >= REFERRAL_WINDOW[0] && days < REFERRAL_WINDOW[1] && !had.has("REFERRAL_ASK")) {
      const askedLately = deal.clientId
        ? await db.agentDraft.count({
            where: {
              kind: "REFERRAL_ASK",
              clientId: deal.clientId,
              state: { not: "FAILED" },
              createdAt: { gte: new Date(now.getTime() - REFERRAL_EVERY_DAYS * DAY) },
            },
          })
        : 0;
      if (askedLately === 0) {
        kind = "REFERRAL_ASK";
        trigger = `We finished ${deal.project?.title ?? deal.title} for them ${days} days ago and it is paid for.`;
      }
    }
    if (!kind) continue;

    const contact = await recipientFor(deal);
    if (contact?.doNotContact) continue;
    if (contact?.email && (await draftedRecently(contact.email, now))) continue;

    let wrote = false;
    if (drafter && contact?.email) {
      try {
        const out = await drafter.outreach({
          kind,
          recipientName: contact.name,
          clientName: deal.client?.name ?? null,
          dealTitle: deal.title,
          projectTitle: deal.project?.title ?? null,
          trigger,
          notes: deal.notes,
        });
        await db.agentDraft.create({
          data: {
            kind,
            toEmail: contact.email,
            subject: out.subject,
            body: out.body,
            context: { trigger, stage: deal.stage, daysSinceClosed: days, deal: deal.title, client: deal.client?.name ?? null },
            dealId: deal.id,
            contactId: contact.id,
            clientId: deal.clientId,
          },
        });
        wrote = true;
        drafted += 1;
      } catch (err) {
        console.error(`[crm] ${kind} drafting failed for deal ${deal.id}:`, (err as Error).message);
      }
    }
    // A referral ask is a nice-to-have: without words it is not worth a task. A check-in
    // is the one touch that keeps a client warm, so it becomes a task, once.
    if (!wrote && kind === "CHECK_IN") {
      await db.task.create({
        data: {
          title: `Check in: ${deal.client?.name ?? deal.title}${contact?.email ? "" : " (no email on file)"}`,
          dueAt: now,
          dealId: deal.id,
          contactId: contact?.id ?? null,
          source: "AGENT",
        },
      });
      tasked += 1;
    }
    if (!wrote && kind === "REFERRAL_ASK") continue;
    await db.activity.create({
      data: {
        actor: "Agent",
        action: wrote
          ? `drafted a ${kind === "CHECK_IN" ? "check-in" : "referral ask"} for "${deal.title}" — waiting in the inbox`
          : `added a task to check in with ${deal.client?.name ?? deal.title}`,
      },
    });
  }
  return { drafted, tasked };
}

/**
 * Clients with paid work behind them and nothing new in six months get one standing task
 * to reconnect. One open at a time per client, and not again within 90 days of the last
 * one being done.
 */
export async function addIdleClientTasks(deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const idleSince = new Date(now.getTime() - IDLE_DAYS * DAY);

  const clients = await db.client.findMany({
    where: { status: "ACTIVE", deals: { some: { stage: { in: ["PAID", "WON"] } } } },
    select: {
      id: true,
      name: true,
      deals: { select: { stageChangedAt: true, createdAt: true }, orderBy: { stageChangedAt: "desc" }, take: 1 },
      projects: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  let tasked = 0;
  for (const c of clients) {
    const latest = Math.max(
      c.deals[0]?.stageChangedAt.getTime() ?? 0,
      c.deals[0]?.createdAt.getTime() ?? 0,
      c.projects[0]?.createdAt.getTime() ?? 0,
    );
    if (latest > idleSince.getTime()) continue;

    const title = `Reconnect with ${c.name}`;
    const existing = await db.task.count({
      where: {
        title: { startsWith: title },
        source: "AGENT",
        OR: [{ doneAt: null }, { doneAt: { gte: new Date(now.getTime() - 90 * DAY) } }],
      },
    });
    if (existing > 0) continue;

    const months = Math.floor((now.getTime() - latest) / (30 * DAY));
    await db.task.create({ data: { title: `${title} (nothing new in ${months} months)`, dueAt: now, source: "AGENT" } });
    await db.activity.create({ data: { actor: "Agent", action: `added a task to reconnect with ${c.name}` } });
    tasked += 1;
  }
  return { tasked };
}
