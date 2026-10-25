import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { seedClientLogo, LOGO_DIR } from "../src/lib/logos";
import { cleanDomain } from "../src/lib/logos/sources";

/**
 * Seeds the eight current clients' logos from the v13 boards (design/v13/logos, 160px
 * JPGs), and fills in where the logo job should look for them from now on — the table in
 * PORTAL-V13-HANDOFF.md §4. So the clients list looks right on day one, and the [logos]
 * job refreshes them a month later.
 *
 * Seeded logos are NOT locked (source "seed"), so the job may replace them. A logo staff
 * uploaded by hand is locked and is left alone. Handles and websites are only filled in
 * where empty, so a value somebody has since corrected is not put back. Safe to re-run.
 *
 *   npx tsx scripts/seed-logos.ts --dry-run
 *   npx tsx scripts/seed-logos.ts [--logos design/v13/logos]
 *
 * On the NAS the worker image has neither scripts/ nor design/, so copy both in first:
 *   docker cp scripts/seed-logos.ts <worker>:/app/scripts/seed-logos.ts
 *   docker cp design/v13/logos <worker>:/tmp/v13-logos
 *   docker exec <worker> npx tsx scripts/seed-logos.ts --logos /tmp/v13-logos
 */

type Seed = {
  label: string;
  /** Compared against the client's name and username, lower-cased with punctuation removed. */
  aliases: string[];
  file: string;
  instagramHandle?: string;
  websiteDomain?: string;
};

const SEEDS: Seed[] = [
  { label: "57", aliases: ["57", "57nyc"], file: "57.jpg", instagramHandle: "57.nyc" },
  { label: "Adam Knight", aliases: ["adamknight", "adamknightmusic"], file: "adamknight.jpg", instagramHandle: "adamknightmusic" },
  { label: "HMU", aliases: ["hmu", "hitmeup", "hitmeupnyc"], file: "hmu.jpg", websiteDomain: "hitmeupnyc.com" },
  { label: "Momentos - irl", aliases: ["momentosirl", "momentos"], file: "momentos.jpg", instagramHandle: "momentosirl" },
  { label: "SUYINSAMA", aliases: ["suyinsama"], file: "suyinsama.jpg", instagramHandle: "suyinsama" },
  // @snatamkaur has no profile picture, so her website is the only source worth asking.
  { label: "Snatam", aliases: ["snatam", "snatamkaur"], file: "snatam.jpg", websiteDomain: "snatam.com" },
  { label: "Space Invader", aliases: ["spaceinvader", "spaceinvaders", "spaceinvadersocial", "spaceinvadersocialclub", "sis"], file: "sis.jpg", websiteDomain: "spaceinvadersocial.com" },
  { label: "THE SSH", aliases: ["thessh", "ssh", "thesshnyc"], file: "thessh.jpg", instagramHandle: "thesshnyc" },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const logosDir = path.resolve(arg("--logos") ?? path.join(__dirname, "../design/v13/logos"));
  console.log(`${dryRun ? "[dry run] " : ""}logos from ${logosDir}, saving to ${LOGO_DIR}\n`);

  const clients = await db.client.findMany({
    select: {
      id: true, name: true, username: true, logoLocked: true, logoSource: true,
      instagramHandle: true, websiteDomain: true,
    },
  });

  const matched = new Set<string>();
  const missing: string[] = [];
  for (const seed of SEEDS) {
    const hits = clients.filter((c) => seed.aliases.includes(norm(c.name)) || seed.aliases.includes(norm(c.username)));
    if (hits.length === 0) {
      missing.push(seed.label);
      console.log(`--   ${seed.label}: no client matches`);
      continue;
    }
    if (hits.length > 1) {
      missing.push(seed.label);
      console.log(`??   ${seed.label}: ${hits.length} clients match (${hits.map((h) => `"${h.name}"`).join(", ")}) — skipped, set it by hand`);
      continue;
    }
    const client = hits[0];
    matched.add(client.id);
    const file = path.join(logosDir, seed.file);
    const notes: string[] = [];

    const data: { instagramHandle?: string; websiteDomain?: string } = {};
    if (seed.instagramHandle) {
      if (!client.instagramHandle) data.instagramHandle = seed.instagramHandle;
      else if (client.instagramHandle !== seed.instagramHandle) notes.push(`keeps Instagram @${client.instagramHandle}`);
    }
    if (seed.websiteDomain) {
      if (!client.websiteDomain) data.websiteDomain = cleanDomain(seed.websiteDomain);
      else if (client.websiteDomain !== seed.websiteDomain) notes.push(`keeps website ${client.websiteDomain}`);
    }
    if (data.instagramHandle) notes.push(`Instagram @${data.instagramHandle}`);
    if (data.websiteDomain) notes.push(`website ${data.websiteDomain}`);

    let logoNote: string;
    if (client.logoLocked) logoNote = "logo locked (uploaded by hand), left alone";
    else if (!existsSync(file)) logoNote = `no ${seed.file} in ${logosDir}`;
    else logoNote = `logo ${seed.file}`;

    if (!dryRun) {
      if (Object.keys(data).length) await db.client.update({ where: { id: client.id }, data });
      if (!client.logoLocked && existsSync(file)) {
        const { logoColor } = await seedClientLogo(client.id, readFileSync(file), "seed");
        logoNote += `, colour ${logoColor}`;
      }
    }
    console.log(`ok   ${seed.label} → "${client.name}" (${client.username}): ${[logoNote, ...notes].join("; ")}`);
  }

  const unseeded = clients.filter((c) => !matched.has(c.id));
  console.log(`\n${matched.size} of ${SEEDS.length} seeded${dryRun ? " (dry run — nothing written)" : ""}.`);
  if (missing.length) console.log(`Not matched: ${missing.join(", ")}`);
  if (unseeded.length) {
    console.log(`Clients with no seed (the [logos] job will look for theirs): ${unseeded.map((c) => `"${c.name}"`).join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
