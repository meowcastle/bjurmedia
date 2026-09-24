import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertClientUploadAccess } from "@/lib/submissions";
import { appendChunk } from "@/lib/submissionHandlers";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await params;
  const access = await assertClientUploadAccess(await getSessionUser());
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return appendChunk(access, req, submissionId);
}
