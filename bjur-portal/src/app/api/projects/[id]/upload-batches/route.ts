import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertProjectUploadAccess, generateBatchLabel } from "@/lib/submissions";
import { startBatch } from "@/lib/submissionHandlers";

export const runtime = "nodejs";

/** Starts a new upload session — one on-disk folder all files dropped this visit share. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const access = await assertProjectUploadAccess(await getSessionUser(), projectId);
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return startBatch(access, await generateBatchLabel(projectId, access.userName));
}
