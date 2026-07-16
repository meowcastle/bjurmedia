import { PrismaClient, AssetKind, ClientType, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { ensureInboxDir } from "../src/lib/projects";

const db = new PrismaClient();

const DEV_PASSWORD = "bjurmedia2026";

function dur(mmss: string) {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
}

function bytes(size: string) {
  const [, num, unit] = size.match(/^([\d.]+)\s*(GB|MB)$/)!;
  const n = parseFloat(num);
  return BigInt(Math.round(n * (unit === "GB" ? 1_000_000_000 : 1_000_000)));
}

function price(p: string) {
  return parseInt(p.replace("$", ""), 10);
}

function date(d: string, year = 2026) {
  return new Date(`${d}, ${year}`);
}

type SeedAsset = {
  kind: AssetKind;
  format: "Reel" | "Film" | "Still" | "Master";
  orientation: "landscape" | "portrait";
  name: string;
  createdAt: Date;
  sizeBytes: bigint;
  durationSec?: number;
  dims?: string;
  masterCodec?: string;
  proxyRes?: string;
  licensable?: boolean;
  basePrice?: number;
  weekOf?: Date;
};

const reel = (name: string, d: string, dt: string, size: string): SeedAsset => ({
  kind: "VIDEO",
  format: "Reel",
  orientation: "portrait",
  name,
  createdAt: date(dt),
  durationSec: dur(d),
  sizeBytes: bytes(size),
  masterCodec: `ProRes 422 · ${size}`,
  proxyRes: "1080×1920 H.264",
});

const film = (name: string, d: string, dt: string, size: string): SeedAsset => ({
  kind: "VIDEO",
  format: "Film",
  orientation: "landscape",
  name,
  createdAt: date(dt),
  durationSec: dur(d),
  sizeBytes: bytes(size),
  masterCodec: `ProRes 422 HQ · ${size}`,
  proxyRes: "1080p H.264",
});

const still = (
  name: string,
  orientation: "landscape" | "portrait",
  dims: string,
  dt: string,
  size: string
): SeedAsset => ({
  kind: "PHOTO",
  format: "Still",
  orientation,
  name,
  createdAt: date(dt),
  dims,
  sizeBytes: bytes(size),
});

const master = (
  name: string,
  d: string,
  dt: string,
  size: string,
  priceStr: string
): SeedAsset => ({
  kind: "VIDEO",
  format: "Master",
  orientation: "landscape",
  name,
  createdAt: date(dt),
  durationSec: dur(d),
  sizeBytes: bytes(size),
  masterCodec: `BRAW · ${size}`,
  proxyRes: "watermarked 1080p",
  licensable: true,
  basePrice: price(priceStr),
});

const assetsByProject: Record<string, SeedAsset[]> = {
  p1: [
    reel("SSH_Reel_Hero.mp4", "00:18", "Jun 14", "1.9 GB"),
    reel("SSH_Reel_Product.mp4", "00:22", "Jun 14", "2.2 GB"),
    reel("SSH_Reel_BTS.mp4", "00:15", "Jun 15", "1.4 GB"),
    film("SSH_BrandFilm_60.mp4", "01:00", "Jun 14", "9.4 GB"),
    film("SSH_BrandFilm_Teaser.mp4", "00:20", "Jun 14", "3.1 GB"),
    still("SSH_Still_012.jpg", "landscape", "6048×4032", "Jun 14", "24.1 MB"),
    still("SSH_Still_019.jpg", "landscape", "6048×4032", "Jun 14", "22.8 MB"),
    still("SSH_Portrait_04.jpg", "portrait", "4032×6048", "Jun 15", "25.6 MB"),
    still("SSH_Portrait_07.jpg", "portrait", "4032×6048", "Jun 15", "24.9 MB"),
    still("SSH_Still_031.jpg", "landscape", "6048×4032", "Jun 15", "23.3 MB"),
    still("SSH_Detail_08.jpg", "landscape", "5760×3240", "Jun 15", "11.2 MB"),
    master("SSH_HeroCut_MASTER.braw", "01:00", "Jun 14", "47.2 GB", "$450"),
    master("SSH_ProductFilm_MASTER.braw", "00:40", "Jun 14", "31.8 GB", "$380"),
  ],
  p2: [
    reel("Aera_Reel_Launch.mp4", "00:20", "Jul 03", "2.0 GB"),
    reel("Aera_Reel_Detail.mp4", "00:16", "Jul 03", "1.6 GB"),
    film("Aera_Launch_Film.mp4", "00:45", "Jul 03", "6.8 GB"),
    still("Aera_Pack_01.jpg", "landscape", "7008×4672", "Jul 03", "38.2 MB"),
    still("Aera_Pack_02.jpg", "landscape", "7008×4672", "Jul 03", "36.1 MB"),
    still("Aera_Hero.jpg", "portrait", "4672×7008", "Jul 03", "39.0 MB"),
    master("Aera_Launch_MASTER.braw", "00:45", "Jul 03", "29.4 GB", "$400"),
  ],
  p3: [
    still("Studio_P01.jpg", "portrait", "4032×6048", "May 28", "21.2 MB"),
    still("Studio_P02.jpg", "portrait", "4032×6048", "May 28", "20.6 MB"),
    still("Studio_P03.jpg", "portrait", "4032×6048", "May 28", "22.1 MB"),
    still("Studio_P04.jpg", "portrait", "4032×6048", "May 28", "19.9 MB"),
    still("Studio_P05.jpg", "portrait", "4032×6048", "May 28", "23.0 MB"),
    still("Studio_P06.jpg", "portrait", "4032×6048", "May 28", "21.7 MB"),
    reel("Studio_Reel_BTS.mp4", "00:24", "May 28", "2.4 GB"),
  ],
  p4: [
    reel("NYC_Rooftop_Reel_01.mp4", "00:19", "Jul 02", "1.8 GB"),
    reel("NYC_Rooftop_Reel_02.mp4", "00:21", "Jul 02", "2.0 GB"),
    reel("NYC_Rooftop_Reel_03.mp4", "00:15", "Jul 02", "1.5 GB"),
    film("NYC_Rooftop_Film.mp4", "01:12", "Jul 02", "11.6 GB"),
    still("NYC_Roof_Still_02.jpg", "landscape", "6048×4032", "Jul 02", "25.4 MB"),
    master("NYC_Rooftop_MASTER.braw", "01:12", "Jul 02", "53.1 GB", "$500"),
  ],
  p5: [
    still("FW26_Look_01.jpg", "portrait", "4672×7008", "Jun 09", "35.9 MB"),
    still("FW26_Look_02.jpg", "portrait", "4672×7008", "Jun 09", "37.7 MB"),
    still("FW26_Look_03.jpg", "portrait", "4672×7008", "Jun 09", "36.4 MB"),
    still("FW26_Detail_04.jpg", "landscape", "6000×4000", "Jun 09", "15.1 MB"),
    reel("FW26_Reel_Runway.mp4", "00:23", "Jun 09", "2.3 GB"),
  ],
  p6: [
    reel("SUYIN_Live_Reel_01.mp4", "00:20", "Jun 21", "2.1 GB"),
    reel("SUYIN_Live_Reel_02.mp4", "00:17", "Jun 21", "1.7 GB"),
    film("SUYIN_Live_Recap.mp4", "02:04", "Jun 21", "16.2 GB"),
    master("SUYIN_Live_MASTER.braw", "02:04", "Jun 21", "61.8 GB", "$550"),
  ],
  p7: [
    film("Halcyon_BrandAnthem_60.mp4", "01:00", "Jul 01", "7.9 GB"),
    reel("Halcyon_Anthem_Reel.mp4", "00:18", "Jul 01", "1.8 GB"),
    still("Halcyon_Key_01.jpg", "landscape", "6048×4032", "Jul 01", "23.4 MB"),
    master("Halcyon_Anthem_MASTER.braw", "01:00", "Jul 01", "44.6 GB", "$500"),
  ],
  p8: [
    { ...reel("IG_Jul06_ReelA.mp4", "00:14", "Jul 06", "1.6 GB"), weekOf: date("Jul 06") },
    { ...reel("IG_Jul06_ReelB.mp4", "00:16", "Jul 06", "1.7 GB"), weekOf: date("Jul 06") },
    { ...still("IG_Jul06_Carousel.jpg", "landscape", "5000×5000", "Jul 06", "9.1 MB"), weekOf: date("Jul 06") },
    { ...reel("IG_Jul13_ReelA.mp4", "00:15", "Jul 13", "1.5 GB"), weekOf: date("Jul 13") },
    { ...reel("IG_Jul13_ReelB.mp4", "00:18", "Jul 13", "1.9 GB"), weekOf: date("Jul 13") },
    { ...reel("IG_Jul13_ReelC.mp4", "00:12", "Jul 13", "1.3 GB"), weekOf: date("Jul 13") },
  ],
};

// Retainer working masters (BRAW) are internal — hidden from clients, used for the studio's
// own edits. Halcyon (p7, one-off) is the exception: its master is offered for licensing.
for (const [pid, assets] of Object.entries(assetsByProject)) {
  if (pid === "p7") continue;
  for (const a of assets) {
    if (a.format === "Master") {
      a.licensable = false;
    }
  }
}

const clientsSeed = [
  {
    id: "c1",
    name: "SSH",
    username: "ssh",
    type: ClientType.RETAINER,
    users: [
      { name: "Sasha Hale", email: "sasha@ssh.studio", role: Role.OWNER },
      { name: "Marco Vidal", email: "marco@ssh.studio", role: Role.DOWNLOADER },
    ],
  },
  {
    id: "c2",
    name: "57.NYC",
    username: "57nyc",
    type: ClientType.RETAINER,
    users: [
      { name: "57 Studio", email: "studio@57.nyc", role: Role.OWNER },
      { name: "Dana Okafor", email: "dana@57.nyc", role: Role.DOWNLOADER },
    ],
  },
  {
    id: "c3",
    name: "SUYINSAMA",
    username: "suyinsama",
    type: ClientType.RETAINER,
    users: [
      { name: "Suyin Sama", email: "suyin@suyinsama.com", role: Role.OWNER },
      { name: "Studio Team", email: "team@suyinsama.com", role: Role.VIEWER },
    ],
  },
  {
    id: "c4",
    name: "Halcyon Films",
    username: "halcyon",
    type: ClientType.ONEOFF,
    users: [{ name: "Ivy Chen", email: "ivy@halcyon.film", role: Role.OWNER }],
  },
];

const projectsSeed = [
  { id: "p1", clientId: "c1", title: "Spring Campaign 2026", path: "SSH/Spring-Campaign/2026-06", inboxSlug: "spring-campaign-2026", deliveredAt: date("Jun 18"), expiresAt: null },
  { id: "p2", clientId: "c1", title: "Product Launch — Aera", path: "SSH/Aera-Launch/2026-07", inboxSlug: "aera-launch", deliveredAt: date("Jul 09"), expiresAt: null },
  { id: "p3", clientId: "c1", title: "Studio Portraits", path: "SSH/Studio-Portraits/2026-05", inboxSlug: "studio-portraits", deliveredAt: date("May 30"), expiresAt: null },
  { id: "p4", clientId: "c2", title: "Rooftop Series", path: "57NYC/Rooftop-Series/2026-07", inboxSlug: "rooftop-series", deliveredAt: date("Jul 05"), expiresAt: null },
  { id: "p5", clientId: "c2", title: "FW26 Lookbook", path: "57NYC/FW26-Lookbook/2026-06", inboxSlug: "fw26-lookbook", deliveredAt: date("Jun 12"), expiresAt: null },
  { id: "p6", clientId: "c3", title: "Live Set — Warehouse", path: "SUYINSAMA/Live-Set/2026-06", inboxSlug: "live-set-warehouse", deliveredAt: date("Jun 22"), expiresAt: null },
  { id: "p7", clientId: "c4", title: "Brand Anthem — Delivery", path: "Halcyon/Brand-Anthem/2026-07", inboxSlug: "brand-anthem", deliveredAt: date("Jul 03"), expiresAt: date("Sep 01") },
  { id: "p8", clientId: "c2", title: "IG Posting", path: "57NYC/IG-Posting", inboxSlug: "ig-posting", deliveredAt: date("Jul 13"), expiresAt: null },
];

async function main() {
  console.log("Seeding…");

  await db.favorite.deleteMany();
  await db.license.deleteMany();
  await db.session.deleteMany();
  await db.asset.deleteMany();
  await db.project.deleteMany();
  await db.clientChannel.deleteMany();
  await db.user.deleteMany();
  await db.client.deleteMany();
  await db.activity.deleteMany();
  await db.slackConfig.deleteMany();

  const passwordHash = await hashPassword(DEV_PASSWORD);

  // Staff/admin user
  await db.user.create({
    data: {
      name: "Studio Admin",
      email: "admin@bjurmedia.nyc",
      passwordHash,
      isAdmin: true,
      role: Role.OWNER,
    },
  });

  for (const c of clientsSeed) {
    await db.client.create({
      data: {
        id: c.id,
        name: c.name,
        username: c.username,
        type: c.type,
        users: {
          create: c.users.map((u) => ({
            name: u.name,
            email: u.email,
            role: u.role,
            passwordHash,
          })),
        },
      },
    });
  }

  const clientUsernameById = new Map(clientsSeed.map((c) => [c.id, c.username]));

  for (const p of projectsSeed) {
    const assets = assetsByProject[p.id] ?? [];
    await db.project.create({
      data: {
        id: p.id,
        clientId: p.clientId,
        title: p.title,
        path: p.path,
        inboxSlug: p.inboxSlug,
        deliveredAt: p.deliveredAt,
        expiresAt: p.expiresAt,
        assets: {
          create: assets.map((a) => ({
            kind: a.kind,
            format: a.format,
            orientation: a.orientation,
            name: a.name,
            relPath: `${p.path}/${a.format}/${a.name}`,
            sizeBytes: a.sizeBytes,
            dims: a.dims,
            durationSec: a.durationSec,
            masterCodec: a.masterCodec,
            proxyRes: a.proxyRes,
            proxyStatus: "READY",
            internal: a.format === "Master" && !a.licensable,
            licensable: a.licensable ?? false,
            basePrice: a.basePrice,
            weekOf: a.weekOf,
            createdAt: a.createdAt,
          })),
        },
      },
    });
    await ensureInboxDir(clientUsernameById.get(p.clientId)!, p.inboxSlug);
  }

  await db.slackConfig.create({
    data: {
      id: 1,
      defaultChannel: "#client-deliveries",
    },
  });

  await db.clientChannel.createMany({
    data: [
      { clientId: "c1", channel: "#ssh-deliveries" },
      { clientId: "c2", channel: "#57-social" },
      { clientId: "c3", channel: "#suyinsama" },
    ],
  });

  await db.activity.createMany({
    data: [
      { actor: "SSH", action: "downloaded 12 files from Spring Campaign 2026" },
      { actor: "57.NYC", action: "licensed a BRAW master — Commercial & Broadcast" },
      { actor: "Worker", action: "finished proxies for Rooftop Series (6 assets)" },
    ],
  });

  console.log("Done. Dev login password for every seeded user: " + DEV_PASSWORD);
  console.log("Admin:  admin@bjurmedia.nyc");
  console.log("Client: sasha@ssh.studio (client username: ssh)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
