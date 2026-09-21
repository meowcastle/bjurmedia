import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertProjectUploadAccess } from "@/lib/submissions";
import { createSubmission, listResumable } from "@/lib/submissionHandlers";

export const runtime = "nodejs";

/** Start a new client submission. The seat door; /api/send/[token] is the other one. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const access = await assertProjectUploadAccess(await getSessionUser(), projectId);
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return createSubmission(access, req);
}

/** This client's own non-complete submissions for this project — powers the resume UI. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const access = await assertProjectUploadAccess(await getSessionUser(), projectId);
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return listResumable(access);
}
