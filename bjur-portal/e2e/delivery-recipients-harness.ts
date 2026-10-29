/**
 * Who the new-files email goes to. Runs the batch in dry-run mode, which names every
 * recipient in Activity instead of sending, and reads the list back.
 *
 * The rule is client membership (ClientMember), the same thing sign-in and project
 * access go by. It used to be User.clientId, a login's first client, which nothing
 * keeps current: a contact added to a second client was never mailed about it.
 *
 * Run by e2e/delivery-recipients.spec.ts. Prints one JSON line of results.
 */
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

process.env.PORTAL_URL = "https://portal.example.test";
delete process.env.DELIVERY_EMAILS;
bootstrapHarnessDb();

const results: CheckResult[] = [];
const check = makeChecker(results);

async function main() {
  const { db } = await import("../src/lib/db");
  const { flushPendingDeliveries } = await import("../src/lib/deliveryNotify");

  const band = await db.client.create({ data: { name: "Band", username: "band" } });
  const other = await db.client.create({ data: { name: "Other", username: "other" } });

  // Home client is `other`, but a member of `band` too: the case the old rule missed.
  const mk = async (email: string, home: string, memberOf: string[], over = {}) => {
    const u = await db.user.create({
      data: { clientId: home, email, name: "A Person", role: "OWNER", passwordHash: "x", ...over },
    });
    for (const clientId of memberOf) {
      await db.clientMember.create({ data: { userId: u.id, clientId, role: "OWNER" } });
    }
    return u;
  };
  await mk("home@band.test", band.id, [band.id]);
  await mk("added@other.test", other.id, [other.id, band.id]);
  await mk("optedout@band.test", band.id, [band.id], { notifyDelivery: false });
  await mk("gone@band.test", band.id, [band.id], { deactivatedAt: new Date() });
  // Still pointed at band by the old column, but no longer a member of it.
  await mk("removed@other.test", band.id, [other.id]);

  const project = await db.project.create({
    data: { clientId: band.id, title: "Show", path: "band/show", inboxSlug: "show" },
  });
  const elsewhere = await db.project.create({
    data: { clientId: band.id, title: "Other Show", path: "band/other", inboxSlug: "other-show" },
  });
  // Restricted to one project of band's, so hears about that one only.
  const scoped = await mk("scoped@band.test", band.id, [band.id]);
  await db.projectMember.create({ data: { userId: scoped.id, projectId: elsewhere.id, role: "VIEWER" } });

  const long = new Date(Date.now() - 60 * 60 * 1000);
  await db.asset.create({
    data: {
      projectId: project.id, kind: "VIDEO", format: "Reel", orientation: "portrait",
      name: "clip.mp4", relPath: "band/show/clip.mp4", sizeBytes: BigInt(1),
    },
  });
  await db.project.update({
    where: { id: project.id },
    data: { deliveryPendingSince: long, deliveryPendingAt: long },
  });

  await flushPendingDeliveries();
  const line = (await db.activity.findFirst({ where: { actor: "Mailer" }, orderBy: { id: "desc" } }))?.action ?? "";
  const named = (email: string) => line.includes(email);

  check("dry run names the recipients", line.includes("(dry run) would email"), line);
  check("a member whose home client it is", named("home@band.test"), line);
  check("a member whose home client is another one", named("added@other.test"), line);
  check("not one who turned new-file emails off", !named("optedout@band.test"), line);
  check("not a removed login", !named("gone@band.test"), line);
  check("not one the old column points here but is no longer a member", !named("removed@other.test"), line);
  check("not one restricted to a different project", !named("scoped@band.test"), line);
  check("exactly two", line.includes("would email 2 recipient(s)"), line);

  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err) }]));
  process.exit(0);
});
