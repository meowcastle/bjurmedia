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
  const { sendWeeklyDigests, sendExpiryReminders, sendLicenseReceipt, sendPaymentReleaseReceipt } =
    await import("../src/lib/clientMail");

  // Named for what they now are: one client with a scheduled project on the board, one
  // with a plain delivery. The weekly digest is about scheduled work.
  const retainer = await db.client.create({
    data: { name: "Scheduled Co", username: "retainer" },
  });
  const oneoff = await db.client.create({
    data: { name: "Delivery Co", username: "oneoff" },
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

  const rProject = await mkProject(retainer.id, "Retainer Project", { calendar: true });
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
    "digests go to seats on board projects only",
    weekly.length > 0 && weekly.every((w) => w.to.endsWith("@retainer.test")),
    weekly.map((w) => w.to).join(", ") || "none"
  );
  check("the account owner is among them", weekly.some((w) => w.to === rOwner.email));
  check("a client with no board project gets no weekly digest", !weekly.some((w) => w.to.includes("oneoff")));
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

  // --- the payment-release receipt -------------------------------------------------
  // Recipients come from ClientMember, which is the authority on who belongs to a client
  // — and which disagrees with the legacy User.clientId + User.role pair in production.
  // These seats are built membership-first so the test would fail if the lookup ever
  // reverted to the old columns.
  const payer = await db.client.create({ data: { name: "Payer Co", username: "payer" } });
  const held = await mkProject(payer.id, "Held Project", { paymentHold: true });
  await mkAsset(held.id, "clip-one.mp4");
  await mkAsset(held.id, "clip-two.mp4");
  await mkAsset(held.id, "internal-cut.mp4", { internal: true });

  const mkMember = async (email: string, role: "OWNER" | "VIEWER", over = {}) => {
    const u = await db.user.create({
      data: { email, name: "Pay Er", role: "VIEWER", passwordHash: "x", ...over },
    });
    await db.clientMember.create({ data: { userId: u.id, clientId: payer.id, role } });
    return u;
  };
  const payOwner = await mkMember("owner@payer.test", "OWNER");
  await mkMember("viewer@payer.test", "VIEWER");
  await mkMember("gone@payer.test", "OWNER", { deactivatedAt: new Date() });

  const released: { to: string; props: Record<string, unknown> }[] = [];
  const sendReleased = async (to: string, props: Record<string, unknown>) => {
    released.push({ to, props });
    return { sent: true } as never;
  };

  await sendPaymentReleaseReceipt(held.id, { sendReleased });
  check("the release receipt reaches the client's owner", released.some((r) => r.to === payOwner.email));
  check("a viewer seat is not thanked for a purchase", !released.some((r) => r.to === "viewer@payer.test"));
  check("a revoked seat is not mailed", !released.some((r) => r.to === "gone@payer.test"));
  check("nobody is thanked twice", new Set(released.map((r) => r.to)).size === released.length);
  check(
    "it counts only client-visible files",
    released[0]?.props.fileCount === 2,
    `fileCount=${released[0]?.props.fileCount}`
  );
  check(
    "it links to the project's own gallery",
    released[0]?.props.projectUrl === `https://portal.example.test/p/${held.id}`,
    String(released[0]?.props.projectUrl)
  );

  const beforeRelease = released.length;
  await sendPaymentReleaseReceipt("does-not-exist", { sendReleased });
  check("an unknown project id is ignored, not thrown", released.length === beforeRelease);

  // With no injected transport the real kill switch applies, and DELIVERY_EMAILS is not
  // "live" here — so a release must log its intent rather than mail a real address.
  const activityBefore = await db.activity.count();
  const dry = await sendPaymentReleaseReceipt(held.id);
  const logged = await db.activity.findFirst({
    where: { actor: "Mailer" },
    orderBy: { id: "desc" },
  });
  check("a release with the switch off sends nothing", dry.sent === 0, `sent=${dry.sent}`);
  check("and says so rather than failing silently", (await db.activity.count()) === activityBefore + 1);
  check(
    "naming who would have been thanked",
    logged?.action.includes("(dry run) would thank") === true && logged.action.includes(payOwner.email),
    logged?.action
  );

  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err) }]));
  process.exit(0);
});
