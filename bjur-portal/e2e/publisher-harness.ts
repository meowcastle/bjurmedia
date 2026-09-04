/**
 * Drives publishDuePosts() against a throwaway SQLite database with the Google calls
 * faked, so the publisher's actual guarantees get tested: never post twice, never claim
 * a post went out everywhere when it went to one platform, never retry a
 * misconfiguration, never touch a row another runner is already mid-upload on.
 *
 * Its own database rather than the e2e one: this writes publish states directly, and
 * sharing a SQLite file with a running dev server invites "database is locked" for no
 * benefit — nothing here goes through HTTP.
 *
 * Run by e2e/publisher.spec.ts. Prints one JSON line of results.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "bjur-publisher-")));
const dbPath = path.join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.DERIVED_ROOT = dir;
process.env.MEDIA_ROOT = dir;
// Keeps postSlackEvent from trying to reach a webhook during the run.
delete process.env.SLACK_WEBHOOK_URL;

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  stdio: "pipe",
});

const results: { name: string; pass: boolean; detail?: string }[] = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { publishDuePosts, MAX_PUBLISH_ATTEMPTS } = await import("../src/lib/publisher");

  const client = await db.client.create({
    data: { name: "Harness", username: "harness", type: "RETAINER" },
  });
  const project = await db.project.create({
    data: { clientId: client.id, title: "Harness Project", path: "harness", inboxSlug: "harness" },
  });
  await db.socialAccount.create({
    data: {
      clientId: client.id,
      platform: "YOUTUBE",
      externalId: "UCharness",
      handle: "@harness",
      refreshToken: "harness-refresh-token",
    },
  });

  // A real file on disk, since the uploader is faked but resolvePublishSource is not.
  writeFileSync(path.join(dir, "proxy.mp4"), "not really a video");

  let assetSeq = 0;
  async function makeAsset(over: Record<string, unknown> = {}) {
    assetSeq++;
    return db.asset.create({
      data: {
        projectId: project.id,
        kind: "VIDEO",
        format: "Reel",
        orientation: "portrait",
        name: `harness_${assetSeq}.mp4`,
        relPath: `harness/harness_${assetSeq}.mp4`,
        sizeBytes: BigInt(1234),
        proxyStatus: "READY",
        proxyRelPath: "proxy.mp4",
        proxyRes: "1080×1920 H.264",
        publishState: "APPROVED",
        publishYt: true,
        publishAt: new Date(Date.now() - 60_000),
        caption: "harness caption",
        ...over,
      },
    });
  }

  const configured = () => true;
  const refresh = async () => ({ accessToken: "fake", expiresAt: new Date(Date.now() + 3_600_000) });
  let uploadCalls = 0;
  const okUpload = async () => {
    uploadCalls++;
    return { videoId: `vid_${uploadCalls}`, permalink: `https://www.youtube.com/watch?v=vid_${uploadCalls}` };
  };
  const failUpload = async () => {
    uploadCalls++;
    throw new Error("network went away");
  };

  // ---- 1. happy path ----
  const a1 = await makeAsset();
  await publishDuePosts(new Date(), { configured, refresh, upload: okUpload });
  const r1 = await db.asset.findUniqueOrThrow({ where: { id: a1.id } });
  check("publishes an approved, due post", r1.publishState === "PUBLISHED" && !!r1.ytVideoId, r1.publishState);
  const post1 = await db.socialPost.findFirst({ where: { assetId: a1.id } });
  check("records a SocialPost so insights can find it", !!post1 && post1.externalPostId === r1.ytVideoId);

  // ---- 2. never re-uploads something already published ----
  const before = uploadCalls;
  await publishDuePosts(new Date(), { configured, refresh, upload: okUpload });
  check("does not post the same video twice", uploadCalls === before, `${uploadCalls} vs ${before}`);

  // ---- 3. partial publish: Instagram still outstanding ----
  const a3 = await makeAsset({ publishIg: true });
  await publishDuePosts(new Date(), { configured, refresh, upload: okUpload });
  const r3 = await db.asset.findUniqueOrThrow({ where: { id: a3.id } });
  check(
    "does not claim PUBLISHED when Instagram is still outstanding",
    r3.publishState === "APPROVED" && !!r3.ytVideoId,
    `${r3.publishState} / yt=${r3.ytVideoId}`
  );

  // This is the case the ytVideoId filter actually exists for. A partially-published
  // post sits back in APPROVED waiting on Instagram, so the publishState guard alone
  // would hand it straight back to YouTube on the very next tick and post it twice.
  const beforePartial = uploadCalls;
  await publishDuePosts(new Date(), { configured, refresh, upload: okUpload });
  const r3b = await db.asset.findUniqueOrThrow({ where: { id: a3.id } });
  check(
    "does not re-upload a post still waiting on its other platform",
    uploadCalls === beforePartial && r3b.ytVideoId === r3.ytVideoId,
    `${uploadCalls} vs ${beforePartial}`
  );

  // ---- 4. watermarked proxy is refused outright ----
  const a4 = await makeAsset({ licensable: true, proxyRes: "watermarked 1080p" });
  const beforeWm = uploadCalls;
  await publishDuePosts(new Date(), { configured, refresh, upload: okUpload });
  const r4 = await db.asset.findUniqueOrThrow({ where: { id: a4.id } });
  check(
    "refuses a watermarked proxy without uploading it",
    r4.publishState === "FAILED" && uploadCalls === beforeWm && /watermarked/i.test(r4.publishError ?? ""),
    `${r4.publishState} / ${r4.publishError}`
  );
  check("gives up immediately on a permanent problem", r4.publishAttempts === 1, String(r4.publishAttempts));

  // ---- 5. transient failure retries, then stops ----
  const a5 = await makeAsset();
  for (let i = 0; i < MAX_PUBLISH_ATTEMPTS; i++) {
    await publishDuePosts(new Date(), { configured, refresh, upload: failUpload });
  }
  const r5 = await db.asset.findUniqueOrThrow({ where: { id: a5.id } });
  check(
    "retries a transient failure and then stops asking",
    r5.publishState === "FAILED" && r5.publishAttempts === MAX_PUBLISH_ATTEMPTS,
    `${r5.publishState} after ${r5.publishAttempts}`
  );

  // ---- 6. not due yet ----
  const a6 = await makeAsset({ publishAt: new Date(Date.now() + 3_600_000) });
  await publishDuePosts(new Date(), { configured, refresh, upload: okUpload });
  const r6 = await db.asset.findUniqueOrThrow({ where: { id: a6.id } });
  check("leaves a post scheduled for later alone", r6.publishState === "APPROVED" && !r6.ytVideoId);

  // ---- 7. a row stuck mid-upload is never picked up again ----
  const a7 = await makeAsset({ publishState: "PUBLISHING" });
  const beforeStuck = uploadCalls;
  await publishDuePosts(new Date(), { configured, refresh, upload: okUpload });
  const r7 = await db.asset.findUniqueOrThrow({ where: { id: a7.id } });
  check(
    "never retries a post left mid-upload by a crash",
    r7.publishState === "PUBLISHING" && uploadCalls === beforeStuck,
    r7.publishState
  );

  // ---- 8. no connected channel ----
  await db.socialAccount.deleteMany({ where: { clientId: client.id } });
  const a8 = await makeAsset();
  await publishDuePosts(new Date(), { configured, refresh, upload: okUpload });
  const r8 = await db.asset.findUniqueOrThrow({ where: { id: a8.id } });
  check(
    "fails clearly when the client has no connected channel",
    r8.publishState === "FAILED" && /no connected youtube/i.test(r8.publishError ?? ""),
    r8.publishError ?? ""
  );

  // ---- 9. nothing happens at all without credentials ----
  const a9 = await makeAsset();
  await publishDuePosts(new Date(), { configured: () => false, refresh, upload: okUpload });
  const r9 = await db.asset.findUniqueOrThrow({ where: { id: a9.id } });
  check("stays idle when OAuth isn't configured", r9.publishState === "APPROVED");

  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err) }]));
  process.exit(0);
});
