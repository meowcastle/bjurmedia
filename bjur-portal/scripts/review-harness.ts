/**
 * Exercises the review loop against a throwaway database.
 *
 * Runs the real openReview / respondToReview / reopenReview against real Prisma, with
 * only the two mail senders replaced — so the version numbering, the idempotency and
 * the conditional claims are all genuinely under test, not stubbed around.
 *
 *   DATABASE_URL="file:/tmp/rev.db" npx tsx scripts/review-harness.ts
 */
import { db } from "@/lib/db";
import { openReview, respondToReview, reopenReview } from "@/lib/reviews";
import { notifyReviewRequest, notifyFeedback } from "@/lib/reviewMail";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "  ok  " : "  FAIL"}  ${label}${detail && !cond ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}

type Sent = { to: string; subject: string };

async function main() {
  // Two projects on one client: review on, review off. Same client, so anything that
  // leaks across the switch shows up immediately.
  const client = await db.client.create({
    data: { name: "Harness Co", username: `harness-${Date.now()}`, accentColor: "#2b6b47" },
  });
  const owner = await db.user.create({
    data: {
      email: `owner-${Date.now()}@example.test`,
      name: "Owner Seat",
      clientId: client.id,
      role: "OWNER",
      passwordHash: "x",
    },
  });
  await db.clientMember.create({ data: { userId: owner.id, clientId: client.id, role: "OWNER" } });
  const viewer = await db.user.create({
    data: {
      email: `viewer-${Date.now()}@example.test`,
      name: "Viewer Seat",
      clientId: client.id,
      role: "VIEWER",
      passwordHash: "x",
    },
  });
  await db.clientMember.create({ data: { userId: viewer.id, clientId: client.id, role: "VIEWER" } });
  await db.user.create({
    data: { email: `staff-${Date.now()}@example.test`, name: "Studio", isAdmin: true, passwordHash: "x" },
  });

  const mk = async (title: string, review: boolean) =>
    db.project.create({
      data: {
        clientId: client.id,
        title,
        path: `/vol/${title}`,
        inboxSlug: `${title}-${Date.now()}`,
        review,
      },
    });
  const reviewProject = await mk("reviewed", true);
  const plainProject = await mk("plain", false);

  const asset = async (projectId: string, name: string, extra: Record<string, unknown> = {}) =>
    db.asset.create({
      data: {
        projectId,
        kind: "VIDEO",
        format: "Reel",
        orientation: "V",
        name,
        relPath: `x/${name}`,
        sizeBytes: BigInt(1000),
        durationSec: 24,
        ...extra,
      },
    });

  // --- eligibility ---------------------------------------------------------
  const a1 = await asset(reviewProject.id, "cut.mp4");
  const r1 = await openReview(a1.id);
  check("opens a round on a review project", r1 !== null);
  check("first upload is cut 1", r1?.version === 1, `got ${r1?.version}`);

  const a2 = await asset(plainProject.id, "other.mp4");
  check("opens nothing on a non-review project", (await openReview(a2.id)) === null);

  const a3 = await asset(reviewProject.id, "master.braw", { internal: true });
  check("opens nothing for an internal master", (await openReview(a3.id)) === null);

  // --- idempotency ---------------------------------------------------------
  const again = await openReview(a1.id);
  check("re-firing the watcher reuses the round", again?.id === r1?.id);
  check(
    "one round exists for the version",
    (await db.review.count({ where: { assetId: a1.id } })) === 1
  );

  // --- versions ------------------------------------------------------------
  await db.asset.update({ where: { id: a1.id }, data: { reingestCount: 1 } });
  const r2 = await openReview(a1.id);
  check("a re-upload opens a new round", r2 !== null && r2.id !== r1!.id);
  check("second upload is cut 2", r2?.version === 2, `got ${r2?.version}`);
  check(
    "the note on cut 1 survives cut 2 landing",
    (await db.review.count({ where: { assetId: a1.id } })) === 2
  );

  // --- responding ----------------------------------------------------------
  const bad = await respondToReview(r2!.id, viewer.id, { state: "FEEDBACK", feedback: "  " });
  check("blank notes store as null, not whitespace", bad.ok);
  check(
    "empty feedback is normalised",
    (await db.review.findUnique({ where: { id: r2!.id } }))?.feedback === null
  );

  const second = await respondToReview(r2!.id, owner.id, { state: "APPROVED" });
  check("a second answer cannot overwrite the first", !second.ok);
  check(
    "second answer reports why",
    second.ok === false && second.error === "already-answered",
    JSON.stringify(second)
  );

  // --- undo ----------------------------------------------------------------
  check("someone else cannot undo your answer", (await reopenReview(r2!.id, owner.id)) === false);
  check("the responder can undo", (await reopenReview(r2!.id, viewer.id)) === true);
  const reopened = await db.review.findUnique({ where: { id: r2!.id } });
  check(
    "undo clears the answer entirely",
    reopened?.state === "PENDING" && reopened.userId === null && reopened.respondedAt === null
  );
  check("cannot undo a round nobody answered", (await reopenReview(r2!.id, viewer.id)) === false);

  // --- approving cut 1 while cut 2 is open ---------------------------------
  const one = await respondToReview(r1!.id, owner.id, { state: "APPROVED" });
  check("an older round can still be answered", one.ok);
  check(
    "answering cut 1 leaves cut 2 pending",
    (await db.review.findUnique({ where: { id: r2!.id } }))?.state === "PENDING"
  );

  // --- mail ----------------------------------------------------------------
  const requests: Sent[] = [];
  const feedbacks: Sent[] = [];
  const a4 = await asset(reviewProject.id, "third.mp4");
  const r4 = await openReview(a4.id);
  await notifyReviewRequest(r4!.id, {
    sendRequest: async (to, p) => {
      requests.push({ to, subject: p.title });
      return { sent: true };
    },
  });
  check("request goes to the owner seat", requests.some((m) => m.to === owner.email));
  check("request skips non-owner seats", !requests.some((m) => m.to === viewer.email));

  await respondToReview(r4!.id, owner.id, { state: "FEEDBACK", feedback: "Lose the last shot." });
  await notifyFeedback(r4!.id, {
    sendFeedback: async (to, p) => {
      feedbacks.push({ to, subject: p.feedback ?? "" });
      return { sent: true };
    },
  });
  check("studio hears about notes", feedbacks.length === 1);
  // A queue that retries must not ask the client to review what they already answered.
  const rechase: Sent[] = [];
  await notifyReviewRequest(r4!.id, {
    sendRequest: async (to) => {
      rechase.push({ to, subject: "" });
      return { sent: true };
    },
  });
  check("an answered round is never re-requested", rechase.length === 0);
  check("the note is quoted verbatim", feedbacks[0]?.subject === "Lose the last shot.");

  // A round still pending must not generate a "they answered" mail.
  const a5 = await asset(reviewProject.id, "fourth.mp4");
  const r5 = await openReview(a5.id);
  const none: Sent[] = [];
  await notifyFeedback(r5!.id, {
    sendFeedback: async (to) => {
      none.push({ to, subject: "" });
      return { sent: true };
    },
  });
  check("no feedback mail for an unanswered round", none.length === 0);

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
