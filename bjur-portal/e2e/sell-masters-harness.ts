/**
 * Proves the "Sell masters" switch actually decides what happens to a master on ingest.
 *
 * This replaced Client.type: a one-off client's masters were licensable, a retainer's
 * were internal. Nothing tested that through the ingest path — the licensing spec uses
 * a seeded asset with the flags already set, so it passes even when ingest ignores the
 * switch entirely. That gap is what this closes.
 *
 * Run by e2e/sell-masters.spec.ts. Prints one JSON line of results.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "bjur-sell-")));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.MEDIA_ROOT = dir;
process.env.DERIVED_ROOT = path.join(dir, "_derived");
process.env.INBOX_ROOT = path.join(dir, "_inbox");
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

async function main() {
  const { db } = await import("../src/lib/db");
  const { ingestFile } = await import("../src/lib/ingest");

  const client = await db.client.create({
    data: { name: "Sell Co", username: `sell-${Date.now()}` },
  });

  const mk = async (title: string, sellMasters: boolean) => {
    const slug = `${title}-${Date.now()}`;
    const p = await db.project.create({
      data: { clientId: client.id, title, path: title, inboxSlug: slug, sellMasters },
    });
    return { project: p, slug };
  };

  const selling = await mk("selling", true);
  const inhouse = await mk("inhouse", false);

  // A master dropped into each project's inbox.
  async function drop(slug: string, name: string) {
    const inbox = path.join(dir, "_inbox", client.username, slug);
    mkdirSync(inbox, { recursive: true });
    const file = path.join(inbox, name);
    writeFileSync(file, Buffer.alloc(2048, 7));
    return file;
  }

  const a = await drop(selling.slug, "SellMe_MASTER.braw");
  const b = await drop(inhouse.slug, "KeepMe_MASTER.braw");

  await ingestFile(a).catch((e) => check("ingest (selling) threw", false, String(e)));
  await ingestFile(b).catch((e) => check("ingest (in-house) threw", false, String(e)));

  const sold = await db.asset.findFirst({ where: { projectId: selling.project.id } });
  const kept = await db.asset.findFirst({ where: { projectId: inhouse.project.id } });

  check("a master lands in a selling project", sold !== null);
  check("and is offered for licence", sold?.licensable === true, `licensable=${sold?.licensable}`);
  check("and is visible to the client", sold?.internal === false, `internal=${sold?.internal}`);

  check("a master lands in an in-house project", kept !== null);
  check("and is not for sale", kept?.licensable === false, `licensable=${kept?.licensable}`);
  check("and is hidden from the client", kept?.internal === true, `internal=${kept?.internal}`);

  console.log(JSON.stringify(results));
}

main();
