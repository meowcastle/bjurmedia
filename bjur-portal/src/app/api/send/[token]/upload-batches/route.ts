import { NextRequest, NextResponse } from "next/server";
import { assertRequestUploadAccess } from "@/lib/submissions";
import { startBatch } from "@/lib/submissionHandlers";
import { generateBatchLabel } from "@/lib/submissions";

export const runtime = "nodejs";

/**
 * Opens a batch for a send link. The sender's name, if they gave one, is carried on the
 * batch rather than asked for per file — it is who sent this lot, not who sent this file.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const senderName = typeof body?.senderName === "string" ? body.senderName : null;

  const access = await assertRequestUploadAccess(token, senderName);
  if (!access.ok) return new NextResponse(null, { status: access.status });

  return startBatch(access, await generateBatchLabel(access.project.id, access.userName));
}
