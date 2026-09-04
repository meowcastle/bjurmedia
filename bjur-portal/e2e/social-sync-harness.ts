/**
 * Drives syncSocialAccount() with the platform fetchers faked.
 *
 * The interesting behaviour is attribution: which delivered asset a post gets credited
 * to. Before this, the only signal was a filename appearing in a caption within three
 * days of the post — a guess that lands on the wrong file of a batch delivered the same
 * week. Anything this portal published now carries the platform's own id, which is
 * certain, and that has to beat the guess without ever overwriting a human's correction.
 *
 * Run by e2e/social-sync.spec.ts. Prints one JSON line of results.
 */
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

bootstrapHarnessDb();

const results: CheckResult[] = [];
const check = makeChecker(results);

async function main() {
  const { db } = await import("../src/lib/db");
  const { syncSocialAccount } = await import("../src/lib/socialSync");

  const client = await db.client.create({
    data: { name: "SyncHarness", username: "syncharness", type: "RETAINER" },
  });
  const project = await db.project.create({
    data: { clientId: client.id, title: "Sync Project", path: "sync", inboxSlug: "sync" },
  });
  const account = await db.socialAccount.create({
    data: {
      clientId: client.id,
      platform: "YOUTUBE",
      externalId: "UCsync",
      handle: "@sync",
      refreshToken: "r",
    },
  });
  await db.socialConfig.create({ data: { id: 1, youtubeApiKey: "harness-key" } });

  let seq = 0;
  async function makeAsset(over: Record<string, unknown> = {}) {
    seq++;
    return db.asset.create({
      data: {
        projectId: project.id,
        kind: "VIDEO",
        format: "Reel",
        orientation: "portrait",
        name: `sync_${seq}.mp4`,
        relPath: `sync/sync_${seq}.mp4`,
        sizeBytes: BigInt(10),
        ...over,
      },
    });
  }

  const post = (over: Record<string, unknown> = {}) => ({
    externalPostId: "vid_abc",
    permalink: "https://www.youtube.com/watch?v=vid_abc",
    caption: "a caption mentioning nothing in particular",
    postedAt: new Date(),
    kind: "VIDEO" as const,
    viewCount: 1234,
    ...over,
  });
  const fetchYouTube = (posts: ReturnType<typeof post>[]) => async () => posts;

  // ---- 1. the id the publisher stored is used, and labelled as certain ----
  const published = await makeAsset({ ytVideoId: "vid_abc" });
  await makeAsset(); // a decoy the fuzzy matcher could otherwise reach for
  await syncSocialAccount(account.id, { fetchYouTube: fetchYouTube([post()]) });
  const r1 = await db.socialPost.findUniqueOrThrow({ where: { externalPostId: "vid_abc" } });
  check(
    "credits the post to the asset that was published as it",
    r1.assetId === published.id && r1.matchConfidence === "id",
    `${r1.assetId === published.id} / ${r1.matchConfidence}`
  );
  check("still records the view count", r1.viewCount === 1234, String(r1.viewCount));

  // ---- 2. an id match upgrades an earlier guess ----
  const guessedWrong = await makeAsset();
  await db.socialPost.update({
    where: { externalPostId: "vid_abc" },
    data: { assetId: guessedWrong.id, matchConfidence: "auto" },
  });
  await syncSocialAccount(account.id, { fetchYouTube: fetchYouTube([post({ viewCount: 2000 })]) });
  const r2 = await db.socialPost.findUniqueOrThrow({ where: { externalPostId: "vid_abc" } });
  check(
    "an exact id match corrects an earlier filename guess",
    r2.assetId === published.id && r2.matchConfidence === "id",
    `${r2.matchConfidence}`
  );

  // ---- 3. a human's correction outranks everything ----
  const humanChoice = await makeAsset();
  await db.socialPost.update({
    where: { externalPostId: "vid_abc" },
    data: { assetId: humanChoice.id, matchConfidence: "manual" },
  });
  await syncSocialAccount(account.id, { fetchYouTube: fetchYouTube([post({ viewCount: 3000 })]) });
  const r3 = await db.socialPost.findUniqueOrThrow({ where: { externalPostId: "vid_abc" } });
  check(
    "never overwrites a manual correction",
    r3.assetId === humanChoice.id && r3.matchConfidence === "manual",
    `${r3.matchConfidence}`
  );
  check("but still refreshes its view count", r3.viewCount === 3000, String(r3.viewCount));

  // ---- 4. no id match falls back to the filename heuristic ----
  const byName = await makeAsset({ weekOf: new Date() });
  await syncSocialAccount(account.id, {
    fetchYouTube: fetchYouTube([
      post({
        externalPostId: "vid_fuzzy",
        caption: `behind the scenes — ${byName.name.replace(/\.[^.]+$/, "")}`,
      }),
    ]),
  });
  const r4 = await db.socialPost.findUniqueOrThrow({ where: { externalPostId: "vid_fuzzy" } });
  check(
    "still falls back to the filename match for posts we did not publish",
    r4.assetId === byName.id && r4.matchConfidence === "auto",
    `${r4.assetId === byName.id} / ${r4.matchConfidence}`
  );

  // ---- 5. an unmatchable post is kept, not dropped ----
  await syncSocialAccount(account.id, {
    fetchYouTube: fetchYouTube([post({ externalPostId: "vid_orphan", caption: "no clue" })]),
  });
  const r5 = await db.socialPost.findUniqueOrThrow({ where: { externalPostId: "vid_orphan" } });
  check("keeps an unmatched post rather than discarding it", r5.assetId === null);

  // ---- 6. a failing platform records the error instead of throwing ----
  await syncSocialAccount(account.id, {
    fetchYouTube: async () => {
      throw new Error("quota exceeded");
    },
  });
  const acct = await db.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
  check(
    "records a sync failure on the account instead of throwing",
    acct.lastSyncError === "quota exceeded",
    acct.lastSyncError ?? "null"
  );

  // ---- 7. and clears it once the next run succeeds ----
  await syncSocialAccount(account.id, { fetchYouTube: fetchYouTube([post()]) });
  const acct2 = await db.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
  check("clears the error once a sync succeeds", acct2.lastSyncError === null && !!acct2.lastSyncedAt);

  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err) }]));
  process.exit(0);
});
