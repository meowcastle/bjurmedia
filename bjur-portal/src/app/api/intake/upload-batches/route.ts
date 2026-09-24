import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertClientUploadAccess, generateBatchName } from "@/lib/submissions";
import { startBatch } from "@/lib/submissionHandlers";

export const runtime = "nodejs";

/**
 * Starts a new upload session — one on-disk folder all files dropped this visit share.
 *
 * No project in the path. A seat sending footage for their own client does not have to
 * decide in advance what it will be cut into, and the old route made them: it demanded a
 * project and an open request on it, which is how a client got locked out of sending
 * anything at all because nobody had remembered to make one.
 */
export async function POST(req: NextRequest) {
  const access = await assertClientUploadAccess(await getSessionUser());
  if (!access.ok) return new NextResponse(null, { status: access.status });

  const body = await req.json().catch(() => ({}));
  const typed = typeof body?.name === "string" ? body.name : null;
  return startBatch(access, await generateBatchName(access.client.id, access.userName, typed));
}
