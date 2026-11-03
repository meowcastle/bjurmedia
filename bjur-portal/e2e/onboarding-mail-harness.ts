/**
 * First-login details and the review guide, against a throwaway database with only the
 * mail senders (and, for the cut loop, the password issuer) injected.
 *
 * The rules worth defending: a seat that has never signed in is never sent a link it
 * cannot get past, a guest is never sent a password, the guide goes out exactly once, a
 * dry run resets nobody's password, and a cut dropped into a Film inbox is not announced
 * before the studio releases it.
 *
 * Run by e2e/onboarding-mail.spec.ts. Prints one JSON line of results.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

process.env.PORTAL_URL = "https://portal.example.test";
// Nothing here may reach a real mail server: the cut loop's senders are injected, and the
// delivery path falls through to the mailer's log-only mode.
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;
const DIR = bootstrapHarnessDb();
process.env.INBOX_ROOT = path.join(DIR, "_inbox");

const results: CheckResult[] = [];
const check = makeChecker(results);

type CutMail = { to: string; login?: { signInEmail: string; tempPassword: string; signInUrl: string }; canApprove?: boolean };
type GuideMail = { to: string; isGuest: boolean; canApprove: boolean; version: number };

async function main() {
  const { db } = await import("../src/lib/db");
  const { releaseCut, openReview } = await import("../src/lib/reviews");
  const { notifyCutReady } = await import("../src/lib/reviewMail");
  const { flushPendingDeliveries, DELIVERY_QUIET_MS } = await import("../src/lib/deliveryNotify");
  const { ingestFile } = await import("../src/lib/ingest");

  const client = await db.client.create({ data: { name: "Harness Co", username: "harness" } });
  const film = await db.project.create({
    data: { clientId: client.id, title: "The Film", type: "FILM", path: "harness/film", inboxSlug: "film" },
  });

  const mkUser = async (name: string, email: string, role: "OWNER" | "VIEWER", over = {}) => {
    const u = await db.user.create({ data: { name, email, passwordHash: "original-hash", ...over } });
    await db.clientMember.create({ data: { clientId: client.id, userId: u.id, role } });
    return u;
  };
  const fresh = await mkUser("Nora New", "new@harness.test", "OWNER");
  const regular = await mkUser("Sam Signed", "signed@harness.test", "VIEWER", { lastLoginAt: new Date() });
  const gone = await mkUser("Dee Gone", "gone@harness.test", "VIEWER", { deactivatedAt: new Date() });

  for (const u of [fresh, regular, gone]) {
    await db.reviewer.create({ data: { projectId: film.id, kind: "SEAT", userId: u.id, email: u.email, name: u.name } });
  }
  const guest = await db.reviewer.create({
    data: { projectId: film.id, kind: "GUEST", email: "tom@guest.test", name: "Tom Guest", token: "a".repeat(64) },
  });

  let n = 0;
  const mkCut = async () => {
    n += 1;
    const asset = await db.asset.create({
      data: {
        projectId: film.id, kind: "VIDEO", format: "Film", orientation: "landscape",
        name: `v${n}.mov`, relPath: `harness/film/Film/v${n}.mov`, sizeBytes: BigInt(1), proxyStatus: "READY",
      },
    });
    const cut = await openReview(asset.id);
    await releaseCut(cut!.id);
    return cut!;
  };

  const run = async (reviewId: string) => {
    const cuts: CutMail[] = [];
    const guides: GuideMail[] = [];
    const issued: string[] = [];
    const res = await notifyCutReady(reviewId, {
      sendCutReady: async (to, p) => {
        cuts.push({ to, login: p.login, canApprove: p.canApprove });
        return { sent: true };
      },
      sendReviewGuide: async (to, p) => {
        guides.push({ to, isGuest: p.isGuest, canApprove: p.canApprove, version: p.version });
        return { sent: true };
      },
      issuePassword: async (userId) => {
        issued.push(userId);
        return { user: await db.user.findUniqueOrThrow({ where: { id: userId } }), tempPassword: `temp-${issued.length}` };
      },
    });
    return { res, cuts, guides, issued };
  };
  const cutTo = (m: CutMail[], email: string) => m.find((x) => x.to === email);

  // --- a dry run --------------------------------------------------------------------
  process.env.DELIVERY_EMAILS = "off";
  const dry = await run((await mkCut()).id);
  check("dry run: the cut still goes to every active reviewer", dry.cuts.length === 4, `cuts=${dry.cuts.length}`);
  check("dry run: no password is issued", dry.issued.length === 0, `issued=${dry.issued.length}`);
  check("dry run: no login in any mail", dry.cuts.every((m) => !m.login));
  check("dry run: no guide is sent", dry.guides.length === 0);
  check(
    "dry run: nothing is stamped",
    (await db.reviewer.count({ where: { projectId: film.id, guideSentAt: { not: null } } })) === 0
  );
  check(
    "dry run: the activity feed says what it would have done",
    (await db.activity.count({ where: { action: { contains: "(dry run) would include first-login details for new@harness.test" } } })) === 1
  );

  // --- live, first cut each reviewer receives ---------------------------------------
  process.env.DELIVERY_EMAILS = "live";
  const cut2 = await mkCut();
  const live = await run(cut2.id);
  const toFresh = cutTo(live.cuts, fresh.email);
  check("a never-signed-in seat gets its login", !!toFresh?.login && toFresh.login.tempPassword === "temp-1");
  check("its login names the address it signs in with", toFresh?.login?.signInEmail === fresh.email);
  check(
    "and signing in leads back to the review screen",
    toFresh?.login?.signInUrl === `https://portal.example.test/login?next=${encodeURIComponent(`/p/${film.id}/review`)}`,
    toFresh?.login?.signInUrl
  );
  check("exactly one password is issued", live.issued.length === 1 && live.issued[0] === fresh.id);
  check("a seat that has signed in gets no login", !!cutTo(live.cuts, regular.email) && !cutTo(live.cuts, regular.email)!.login);
  check("a guest never gets a login", !!cutTo(live.cuts, guest.email) && !cutTo(live.cuts, guest.email)!.login);
  check("a deactivated seat never gets a login", !!cutTo(live.cuts, gone.email) && !cutTo(live.cuts, gone.email)!.login);
  check("the owner is told they can approve", toFresh?.canApprove === true);
  check("a viewer is not", cutTo(live.cuts, regular.email)?.canApprove === false);

  check("every reviewer gets the guide", live.guides.length === live.cuts.length, `guides=${live.guides.length}`);
  check("the guest's guide is the guest version", live.guides.find((g) => g.to === guest.email)?.isGuest === true);
  check("the guest is never offered approve", live.guides.find((g) => g.to === guest.email)?.canApprove === false);
  check("the owner's guide offers approve", live.guides.find((g) => g.to === fresh.email)?.canApprove === true);
  check("the guide names the cut they were sent", live.guides.every((g) => g.version === cut2.version));
  check(
    "each reviewer is stamped",
    (await db.reviewer.count({ where: { projectId: film.id, revokedAt: null, guideSentAt: { not: null } } })) === live.cuts.length
  );
  check("the result counts the guides", live.res.guides === live.guides.length);

  // --- the next cut -----------------------------------------------------------------
  await db.user.update({ where: { id: fresh.id }, data: { lastLoginAt: new Date() } });
  const again = await run((await mkCut()).id);
  check("no one gets a second guide", again.guides.length === 0, `guides=${again.guides.length}`);
  check("once they have signed in, no login and no new password", again.issued.length === 0 && again.cuts.every((m) => !m.login));

  // A reviewer added mid-loop gets the guide with the cut they catch up on.
  const late = await db.reviewer.create({
    data: { projectId: film.id, kind: "GUEST", email: "late@guest.test", name: "Late Guest", token: "b".repeat(64) },
  });
  const current = await db.review.findFirst({ where: { asset: { projectId: film.id } }, orderBy: { version: "desc" } });
  const catchUp = await notifyCutReady(current!.id, {
    sendCutReady: async () => ({ sent: true }),
    sendReviewGuide: async (to) => {
      check("a late guest gets the guide on the catch-up send", to === late.email);
      return { sent: true };
    },
  }, [late.id]);
  check("and only the late guest", catchUp.sent === 1 && catchUp.guides === 1);

  // A guide that fails is logged and does not stop the next reviewer's cut.
  const flaky = await db.reviewer.create({
    data: { projectId: film.id, kind: "GUEST", email: "flaky@guest.test", name: "Flaky", token: "c".repeat(64) },
  });
  const after = await db.reviewer.create({
    data: { projectId: film.id, kind: "GUEST", email: "after@guest.test", name: "After", token: "d".repeat(64) },
  });
  const order: string[] = [];
  await notifyCutReady(current!.id, {
    sendCutReady: async (to) => { order.push(`cut:${to}`); return { sent: true }; },
    sendReviewGuide: async (to) => {
      if (to === flaky.email) throw new Error("mail server down");
      order.push(`guide:${to}`);
      return { sent: true };
    },
  }, [flaky.id, after.id]);
  check("a failed guide does not stop the loop", order.includes(`cut:${after.email}`) && order.includes(`guide:${after.email}`), order.join(","));
  check("the cut goes before its guide", order.indexOf(`cut:${after.email}`) < order.indexOf(`guide:${after.email}`));
  check("a failed guide is not stamped", (await db.reviewer.findUniqueOrThrow({ where: { id: flaky.id } })).guideSentAt === null);
  check(
    "and the failure is in the feed",
    (await db.activity.count({ where: { action: { contains: "failed to send the review guide to flaky@guest.test" } } })) === 1
  );

  // --- plain deliveries -------------------------------------------------------------
  const delivery = await db.project.create({
    data: { clientId: client.id, title: "The Delivery", path: "harness/delivery", inboxSlug: "delivery", status: "LIVE" },
  });
  const newcomer = await mkUser("Nell Newcomer", "newcomer@harness.test", "VIEWER");
  const long = new Date(Date.now() - DELIVERY_QUIET_MS - 60_000);
  await db.asset.create({
    data: {
      projectId: delivery.id, kind: "VIDEO", format: "Reel", orientation: "portrait",
      name: "clip.mp4", relPath: "harness/delivery/clip.mp4", sizeBytes: BigInt(1), createdAt: long,
    },
  });

  process.env.DELIVERY_EMAILS = "off";
  await db.project.update({ where: { id: delivery.id }, data: { deliveryPendingAt: long, deliveryPendingSince: long } });
  await flushPendingDeliveries();
  check(
    "dry run delivery: no password is reset",
    (await db.user.findUniqueOrThrow({ where: { id: newcomer.id } })).passwordHash === "original-hash"
  );

  process.env.DELIVERY_EMAILS = "live";
  await db.project.update({ where: { id: delivery.id }, data: { deliveryPendingAt: long, deliveryPendingSince: long } });
  await flushPendingDeliveries();
  const nell = await db.user.findUniqueOrThrow({ where: { id: newcomer.id } });
  check("a never-signed-in recipient gets a fresh password", nell.passwordHash !== "original-hash" && nell.mustChangePassword);
  check(
    "and the welcome with the delivery inside it",
    (await db.activity.count({ where: { action: { contains: "issued first-login password to newcomer@harness.test with The Delivery" } } })) === 1
  );
  check(
    "a recipient who has signed in keeps their password",
    (await db.user.findUniqueOrThrow({ where: { id: regular.id } })).passwordHash === "original-hash"
  );

  // --- a cut dropped into a Film inbox ----------------------------------------------
  const clip = (rel: string) => {
    const abs = path.join(process.env.INBOX_ROOT!, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    execFileSync("ffmpeg", ["-nostdin", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x36:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", abs], { stdio: "pipe" });
    return abs;
  };
  await db.project.update({ where: { id: film.id }, data: { deliveryPendingAt: null, deliveryPendingSince: null } });
  await ingestFile(clip("harness/film/cut-v9.mp4"));
  check(
    "a Film ingest landed",
    (await db.asset.count({ where: { projectId: film.id, name: "cut-v9.mp4" } })) === 1
  );
  check(
    "and does not mark a delivery pending",
    (await db.project.findUniqueOrThrow({ where: { id: film.id } })).deliveryPendingAt === null
  );
  await db.project.update({ where: { id: delivery.id }, data: { deliveryPendingAt: null, deliveryPendingSince: null } });
  await ingestFile(clip("harness/delivery/reel-new.mp4"));
  check(
    "a Delivery ingest still does",
    (await db.project.findUniqueOrThrow({ where: { id: delivery.id } })).deliveryPendingAt !== null
  );

  console.log(JSON.stringify(results));
}

main();
