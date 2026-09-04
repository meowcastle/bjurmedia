/**
 * Drives the weekly digest, expiry reminders and license receipts with the transport
 * faked.
 *
 * Who gets each one, and how often, is the whole risk here: these are the mails that go
 * to clients on a schedule, so a rule that fires twice or reaches the wrong list is the
 * kind of mistake that gets a sending domain filtered.
 *
 * Run by e2e/client-mail.spec.ts. Prints one JSON line of results.
 */
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

process.env.SESSION_SECRET = "harness-secret";
process.env.PORTAL_URL = "https://portal.example.test";
bootstrapHarnessDb();

const results: CheckResult[] = [];
const check = makeChecker(results);

async function main() {
  const { db } = await import("../src/lib/db");
  const { sendWeeklyDigests, sendExpiryReminders, sendLicenseReceipt } = await import("../src/lib/clientMail");

  const retainer = await db.client.create({
    data: { name: "Retainer Co", username: "retainer", type: "RETAINER" },
  });
  const oneoff = await db.client.create({
    data: { name: "Oneoff Co", username: "oneoff", type: "ONEOFF" },
  });

  const mkUser = (clientId: string, email: string, over = {}) =>
    db.user.create({
      data: { clientId, email, name: "A Person", role: "OWNER", passwordHash: "x", ...over },
    });

  const rOwner = await mkUser(retainer.id, "owner@retainer.test");
  await mkUser(retainer.id, "optedout@retainer.test", { notifyDelivery: false });
  // notifyDelivery and notifyExpiry are separate switches: opting out of delivery mail
  // does not opt you out of being told a gallery is about to close.
  await mkUser(retainer.id, "noexpiry@retainer.test", { notifyExpiry: false });
  await mkUser(oneoff.id, "owner@oneoff.test");

  const mkProject = (clientId: string, title: string, over = {}) =>
    db.project.create({
      data: { clientId, title, path: title.toLowerCase().replace(/\W+/g, "-"), inboxSlug: title.toLowerCase().replace(/\W+/g, "-"), ...over },
    });

  const rProject = await mkProject(retainer.id, "Retainer Project");
  const oProject = await mkProject(oneoff.id, "Oneoff Project");

  const weekStart = new Date(Date.UTC(2026, 8, 7)); // a Monday
  const mkAsset = (projectId: string, name: string, over = {}) =>
    db.asset.create({
      data: {
        projectId,
        kind: "VIDEO",
        format: "Reel",
        orientation: "portrait",
        name,
        relPath: `x/${name}`,
        sizeBytes: BigInt(1_500_000_000),
        thumbRelPath: "x/thumb.jpg",
        weekOf: new Date(weekStart.getTime() + 86_400_000),
        ...over,
      },
    });

  await mkAsset(rProject.id, "in_week.mp4");
  await mkAsset(oProject.id, "oneoff.mp4");

  // ---- weekly digest ----
  let weekly: { to: string; props: Record<string, unknown> }[] = [];
  const sendWeekly = async (to: string, props: Record<string, unknown>) => {
    weekly.push({ to, props });
    return { sent: true } as never;
  };

  await sendWeeklyDigests(weekStart, { sendWeekly });
  check(
    "digests go to retainer seats only",
    weekly.length > 0 && weekly.every((w) => w.to.endsWith("@retainer.test")),
    weekly.map((w) => w.to).join(", ") || "none"
  );
  check("the account owner is among them", weekly.some((w) => w.to === rOwner.email));
  check("a one-off client gets no weekly digest", !weekly.some((w) => w.to.includes("oneoff")));
  check("someone who opted out is not mailed", !weekly.some((w) => w.to.includes("optedout")));

  const items = (weekly[0]?.props.items ?? []) as { thumbUrl: string | null }[];
  check(
    "thumbnails are signed so they load without a session",
    items.length === 1 && typeof items[0].thumbUrl === "string" && items[0].thumbUrl.includes("sig="),
    String(items[0]?.thumbUrl)
  );

  // ---- an empty week sends nothing ----
  weekly = [];
  await sendWeeklyDigests(new Date(Date.UTC(2030, 0, 7)), { sendWeekly });
  check("an empty week sends nothing at all", weekly.length === 0, String(weekly.length));

  // ---- expiry ----
  let expiry: { to: string; props: Record<string, unknown> }[] = [];
  const sendExpiry = async (to: string, props: Record<string, unknown>) => {
    expiry.push({ to, props });
    return { sent: true } as never;
  };

  const now = new Date();
  const expiring = await mkProject(retainer.id, "Expiring Soon", {
    expiresAt: new Date(now.getTime() + 10 * 86_400_000),
  });
  await mkAsset(expiring.id, "expiring.mp4");

  await sendExpiryReminders(now, { sendExpiry });
  check(
    "a gallery inside a fortnight reminds everyone who wants reminding",
    expiry.length === 2 && !expiry.some((e) => e.to.includes("noexpiry")),
    expiry.map((e) => e.to).join(", ")
  );
  check("notifyExpiry is honoured separately from notifyDelivery", !expiry.some((e) => e.to.includes("noexpiry")));
  check("it says how long is left", expiry[0]?.props.daysLeft === 10, String(expiry[0]?.props.daysLeft));

  expiry = [];
  await sendExpiryReminders(now, { sendExpiry });
  check("the same reminder does not go out twice", expiry.length === 0, String(expiry.length));

  // Three days out is a second, nearer threshold — it must still fire.
  expiry = [];
  const near = new Date(now.getTime() + 8 * 86_400_000);
  await sendExpiryReminders(near, { sendExpiry });
  check("the three-day warning still fires after the fortnight one", expiry.length === 2, String(expiry.length));
  check("and it is the urgent one", (expiry[0]?.props.daysLeft as number) <= 3, String(expiry[0]?.props.daysLeft));

  expiry = [];
  await sendExpiryReminders(near, { sendExpiry });
  check("and it too only goes out once", expiry.length === 0, String(expiry.length));

  // Moving the date re-arms both.
  await db.project.update({
    where: { id: expiring.id },
    data: { expiresAt: new Date(now.getTime() + 12 * 86_400_000), expiryReminderSentFor: null },
  });
  expiry = [];
  await sendExpiryReminders(now, { sendExpiry });
  check("extending a gallery re-arms the reminders", expiry.length === 2, String(expiry.length));

  // An already-expired gallery is not worth a reminder.
  const gone = await mkProject(retainer.id, "Long Gone", {
    expiresAt: new Date(now.getTime() - 86_400_000),
  });
  await mkAsset(gone.id, "gone.mp4");
  expiry = [];
  await sendExpiryReminders(now, { sendExpiry });
  check("an already-expired gallery is left alone", expiry.length === 0, String(expiry.length));

  // ---- license receipt ----
  const licensed = await mkAsset(rProject.id, "master.braw", { licensable: true, basePrice: 5000 });
  const license = await db.license.create({
    data: {
      assetId: licensed.id,
      clientId: retainer.id,
      userId: rOwner.id,
      tier: "COMMERCIAL",
      amount: 5000,
      scope: "12 months · North America",
      expiresAt: new Date(now.getTime() + 365 * 86_400_000),
    },
  });

  const receipts: { to: string; props: Record<string, unknown> }[] = [];
  const sendLicense = async (to: string, props: Record<string, unknown>) => {
    receipts.push({ to, props });
    return { sent: true } as never;
  };
  await sendLicenseReceipt(license.id, { sendLicense });
  check("a receipt goes to the purchaser", receipts.some((r) => r.to === rOwner.email));
  check("nobody is mailed twice", new Set(receipts.map((r) => r.to)).size === receipts.length);
  check(
    "it carries the frozen scope rather than re-deriving it",
    receipts[0]?.props.scope === "12 months · North America",
    String(receipts[0]?.props.scope)
  );

  // A missing license is not a crash.
  const before = receipts.length;
  await sendLicenseReceipt("does-not-exist", { sendLicense });
  check("an unknown license id is ignored, not thrown", receipts.length === before);

  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err) }]));
  process.exit(0);
});
