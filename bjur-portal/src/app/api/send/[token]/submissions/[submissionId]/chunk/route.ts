import { NextRequest, NextResponse } from "next/server";
import { assertRequestUploadAccess } from "@/lib/submissions";
import { appendChunk } from "@/lib/submissionHandlers";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; submissionId: string }> }
) {
  const { token, submissionId } = await params;
  const access = await assertRequestUploadAccess(token);
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return appendChunk(access, req, submissionId);
}
