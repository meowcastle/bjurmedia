import "dotenv/config";
import { db } from "../src/lib/db";
import { syncAllSocialAccounts } from "../src/lib/socialSync";

/**
 * Manually runs the weekly Instagram/YouTube sync right now, instead of
 * waiting for the Tuesday scheduler. Meant for the first real run against a
 * freshly-pasted access token (Admin > Client > Social accounts, or Admin >
 * Integrations for the YouTube API key) — run this, then check the account's
 * `lastSyncError` and the matched posts in Admin > Media before trusting the
 * client-facing view counts.
 *
 * Usage: npx tsx scripts/social-sync.ts
 */
async function main() {
  const accounts = await db.socialAccount.findMany({ include: { client: true } });
  if (accounts.length === 0) {
    console.log("No linked social accounts yet — nothing to sync. Link one first via the admin UI.");
    return;
  }

  console.log(`Syncing ${accounts.length} linked account(s)...`);
  const result = await syncAllSocialAccounts();
  console.log(`Done. ${result.accountsSynced} account(s) synced.\n`);

  const refreshed = await db.socialAccount.findMany({
    include: { client: true, posts: true },
  });
  for (const a of refreshed) {
    const status = a.lastSyncError ? `FAILED — ${a.lastSyncError}` : `ok, last synced ${a.lastSyncedAt?.toISOString()}`;
    const matched = a.posts.filter((p) => p.assetId).length;
    console.log(`${a.client.name} / ${a.platform} (${a.handle || a.externalId}): ${status}`);
    console.log(`  ${a.posts.length} post(s) fetched, ${matched} matched to a delivered asset`);
  }
}

main()
  .catch((err) => {
    console.error("Sync script failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
