import { NextRequest, NextResponse } from "next/server";
import { postWeeklyDigest } from "@/lib/slack";

/**
 * External cron target for the weekly delivery-calendar digest (SLACK.md §3) — for
 * studios that prefer a Synology Task Scheduler entry over the worker's built-in
 * scheduler (see worker.ts). Not user-facing, so it's gated by a shared secret rather
 * than an admin session.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await postWeeklyDigest();
  return NextResponse.json({ ok: true, ...result });
}
