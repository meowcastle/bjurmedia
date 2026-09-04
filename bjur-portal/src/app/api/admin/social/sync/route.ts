import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncAllSocialAccounts } from "@/lib/socialSync";

/**
 * Runs the insights sync on demand.
 *
 * The weekly scheduler is the normal path; this exists for the moment after connecting a
 * channel, when waiting until Tuesday to find out whether it works is not a reasonable
 * feedback loop. syncSocialAccount never throws — a failure is recorded on the account —
 * so the response reports per-account state rather than a bare ok.
 */
export async function POST() {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accountsSynced } = await syncAllSocialAccounts();

  const accounts = await db.socialAccount.findMany({
    select: {
      platform: true,
      handle: true,
      lastSyncedAt: true,
      lastSyncError: true,
      client: { select: { name: true } },
    },
  });

  return NextResponse.json({
    accountsSynced,
    failed: accounts.filter((a) => a.lastSyncError).length,
    accounts: accounts.map((a) => ({
      client: a.client.name,
      platform: a.platform,
      handle: a.handle,
      lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
      error: a.lastSyncError,
    })),
  });
}
