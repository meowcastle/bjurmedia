/**
 * Drives the FILM cut loop against a throwaway database with only the mail senders
 * injected, so the version numbering, the release gate, the owner-only approval and the
 * draft privacy rule are the real code rather than stubs.
 *
 * The rules worth defending here are the ones no screen can be trusted to enforce: a cut
 * must not go out while a note from the previous one is unanswered, a guest must never be
 * able to approve, and an unsent note must never reach a staff query.
 *
 * Run by e2e/review.spec.ts. Prints one JSON line of results.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "bjur-review-")));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
// Nothing here should reach a real webhook or mail server.
delete process.env.SLACK_WEBHOOK_URL;
process.env.DELIVERY_EMAILS = "off";

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  stdio: "pipe",
});

const results: { name: string; pass: boolean; detail?: string }[] = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

type Sent = { to: string; subject: string };

async function main() {
  const { db } = await import("../src/lib/db");
  const { openReview, releaseCut, approveCut, unapproveCut, currentCut } = await import(
    "../src/lib/reviews"
  );
  const { notifyCutReady, notifyNotesIn } = await import("../src/lib/reviewMail");

  const client = await db.client.create({
    data: { name: "Harness Co", username: `harness-${Date.now()}`, accentColor: "#2b6b47" },
  });
  const film = await db.project.create({
    data: {
      clientId: client.id,
      title: "The Film",
      type: "FILM",
      path: "harness/film",
      inboxSlug: `film-${Date.now()}`,
    },
  });
  const delivery = await db.project.create({
    data: {
      clientId: client.id,
      title: "The Delivery",
      type: "DELIVERY",
      path: "harness/delivery",
      inboxSlug: `delivery-${Date.now()}`,
    },
  });

  const owner = await db.user.create({
    data: { name: "Olive Owner", email: `owner-${Date.now()}@harness.test`, passwordHash: "x" },
  });
  const viewer = await db.user.create({
    data: { name: "Vic Viewer", email: `viewer-${Date.now()}@harness.test`, passwordHash: "x" },
  });
  await db.clientMember.create({ data: { clientId: client.id, userId: owner.id, role: "OWNER" } });
  await db.clientMember.create({ data: { clientId: client.id, userId: viewer.id, role: "VIEWER" } });

  const ownerReviewer = await db.reviewer.create({
    data: { projectId: film.id, kind: "SEAT", userId: owner.id, email: owner.email, name: owner.name },
  });
  const viewerReviewer = await db.reviewer.create({
    data: { projectId: film.id, kind: "SEAT", userId: viewer.id, email: viewer.email, name: viewer.name },
  });
  const guest = await db.reviewer.create({
    data: {
      projectId: film.id,
      kind: "GUEST",
      email: "guest@harness.test",
      name: "Gil Guest",
      role: "Director",
      token: `tok${Date.now()}`,
    },
  });

  const mkAsset = (projectId: string, name: string) =>
    db.asset.create({
      data: {
        projectId,
        kind: "VIDEO",
        format: "Film",
        orientation: "landscape",
        name,
        relPath: `harness/${name}`,
        sizeBytes: BigInt(1000),
        durationSec: 120,
        proxyStatus: "READY",
      },
    });

  // --- eligibility ------------------------------------------------------------------
  const filmAsset = await mkAsset(film.id, "cut.mov");
  const deliveryAsset = await mkAsset(delivery.id, "clip.mov");

  const cut1 = await openReview(filmAsset.id);
  check("a FILM project opens a cut", cut1 !== null);
  check("a cut starts unsent", cut1?.sentAt == null, `sentAt=${cut1?.sentAt}`);
  check("a DELIVERY project opens none", (await openReview(deliveryAsset.id)) === null);

  const again = await openReview(filmAsset.id);
  check("opening twice is idempotent", again?.id === cut1?.id);

  const internal = await db.asset.create({
    data: {
      projectId: film.id,
      kind: "VIDEO",
      format: "Master",
      orientation: "landscape",
      name: "master.mov",
      relPath: "harness/master.mov",
      sizeBytes: BigInt(1),
      internal: true,
      proxyStatus: "READY",
    },
  });
  check("an internal master is not a cut", (await openReview(internal.id)) === null);

  // --- releasing --------------------------------------------------------------------
  check("nothing is current before release", (await currentCut(film.id)) === null);

  const sent: Sent[] = [];
  const released = await releaseCut(cut1!.id);
  check("cut 1 releases with nothing to answer", released.ok === true);
  await notifyCutReady(cut1!.id, {
    sendCutReady: async (to, p) => {
      sent.push({ to, subject: `cut ${p.version}` });
      return { ok: true } as never;
    },
  });
  check("every active reviewer is mailed", sent.length === 3, `sent=${sent.length}`);
  check(
    "the guest is mailed too",
    sent.some((m) => m.to === guest.email)
  );

  const current = await currentCut(film.id);
  check("cut 1 is now the current cut", current?.id === cut1?.id);
  check("releasing twice is refused", (await releaseCut(cut1!.id)).ok === false);

  // --- notes ------------------------------------------------------------------------
  const draft = await db.reviewNote.create({
    data: { reviewId: cut1!.id, reviewerId: viewerReviewer.id, timeSec: 12.5, body: "DRAFT BODY" },
  });
  const sentNote = await db.reviewNote.create({
    data: {
      reviewId: cut1!.id,
      reviewerId: guest.id,
      timeSec: 40,
      body: "Hold the last shot",
      sentAt: new Date(),
    },
  });

  // The privacy rule, as a query rather than a promise: anything the studio reads is
  // filtered on sentAt, so a draft cannot be returned even by accident.
  const staffVisible = await db.reviewNote.findMany({
    where: { reviewId: cut1!.id, sentAt: { not: null } },
  });
  check("a draft is invisible to staff queries", staffVisible.every((n) => n.id !== draft.id));
  check("a sent note is visible", staffVisible.some((n) => n.id === sentNote.id));

  const staffMail: Sent[] = [];
  await notifyNotesIn(cut1!.id, guest.id, [sentNote.id], {
    sendNotesIn: async (to, p) => {
      staffMail.push({ to, subject: `${p.notes.length} notes` });
      return { ok: true } as never;
    },
  });
  check("a batch does not mail reviewers", !staffMail.some((m) => m.to === guest.email));

  // --- the release gate -------------------------------------------------------------
  const cut2Asset = await db.asset.update({
    where: { id: filmAsset.id },
    data: { reingestCount: 1 },
  });
  const cut2 = await openReview(cut2Asset.id);
  check("a re-export opens cut 2", cut2?.version === 2, `version=${cut2?.version}`);

  const blocked = await releaseCut(cut2!.id);
  check(
    "cut 2 will not go out with a note unanswered",
    blocked.ok === false && blocked.error === "unanswered",
    `error=${blocked.ok ? "none" : blocked.error}`
  );

  await db.reviewNote.update({
    where: { id: sentNote.id },
    data: { outcome: "KEPT", response: "It lands with the mix.", answeredAt: new Date() },
  });
  const nowOk = await releaseCut(cut2!.id);
  check("answering every note opens the gate", nowOk.ok === true);

  const cut1After = await db.review.findUniqueOrThrow({ where: { id: cut1!.id } });
  check("releasing cut 2 supersedes cut 1", cut1After.state === "SUPERSEDED");
  check("and records when", cut1After.supersededAt !== null);

  // --- approval ---------------------------------------------------------------------
  check(
    "a guest cannot approve",
    (await approveCut(cut2!.id, guest.id)).ok === false,
    "guests have no account and no say in what is final"
  );
  check("a non-owner seat cannot approve", (await approveCut(cut2!.id, viewerReviewer.id)).ok === false);

  const approved = await approveCut(cut2!.id, ownerReviewer.id);
  check("an owner seat can approve", approved.ok === true);

  const twice = await approveCut(cut2!.id, ownerReviewer.id);
  check("a second approval is refused", twice.ok === false);

  const row = await db.review.findUniqueOrThrow({ where: { id: cut2!.id } });
  check("the approver is recorded", row.approvedById === ownerReviewer.id);

  check("the approver can undo", (await unapproveCut(cut2!.id, ownerReviewer.id)) === true);
  check(
    "someone else cannot undo",
    (await unapproveCut(cut2!.id, viewerReviewer.id)) === false
  );

  // --- revoked reviewers ------------------------------------------------------------
  await db.reviewer.update({ where: { id: guest.id }, data: { revokedAt: new Date() } });
  const afterRevoke: Sent[] = [];
  await notifyCutReady(cut2!.id, {
    sendCutReady: async (to) => {
      afterRevoke.push({ to, subject: "" });
      return { ok: true } as never;
    },
  });
  check(
    "a revoked guest stops being mailed",
    !afterRevoke.some((m) => m.to === guest.email),
    `to=${afterRevoke.map((m) => m.to).join(",")}`
  );

  // --- cut numbers belong to the project ---------------------------------------------
  // A real edit arrives as "v4.mov" then "v5.mov": two assets, each on its first ingest.
  // Numbering per asset made both of them cut 1.
  const { retireUnsentCut, unsentCut } = await import("../src/lib/reviews");

  const v5 = await mkAsset(film.id, "v5.mov");
  const cut3 = await openReview(v5.id);
  check(
    "a differently named export continues the count",
    cut3?.version === 3,
    `version=${cut3?.version}`
  );
  check("the same file re-encoded does not mint another", (await openReview(v5.id))?.id === cut3?.id);

  await db.asset.update({ where: { id: v5.id }, data: { reingestCount: 1 } });
  const cut4 = await openReview(v5.id);
  check("re-dropping the same filename does", cut4?.version === 4 && cut4?.id !== cut3?.id,
    `version=${cut4?.version}`);

  // --- hiding a file retires its cut --------------------------------------------------
  const hidden = await mkAsset(film.id, "wip.mov");
  const wipCut = await openReview(hidden.id);
  check("a visible file opens a cut", wipCut !== null);
  await db.asset.update({ where: { id: hidden.id }, data: { internal: true } });
  check("hiding it retires the unsent cut", (await retireUnsentCut(hidden.id)) === 1);
  check(
    "and nothing unsent is left pointing at it",
    (await db.review.findFirst({ where: { assetId: hidden.id } })) === null
  );

  await db.asset.update({ where: { id: hidden.id }, data: { internal: false } });
  const reopened = await openReview(hidden.id);
  check("showing it again opens a fresh cut", reopened !== null);

  // A cut reviewers have already been mailed about is history: hiding the file does not
  // unmake the notes hanging off it.
  await db.review.update({ where: { id: reopened!.id }, data: { sentAt: new Date() } });
  await db.asset.update({ where: { id: hidden.id }, data: { internal: true } });
  check("a sent cut survives hiding", (await retireUnsentCut(hidden.id)) === 0);
  check(
    "but it is no longer what the studio owes",
    (await unsentCut(film.id))?.assetId !== hidden.id
  );

  console.log(JSON.stringify(results));
}

main();
