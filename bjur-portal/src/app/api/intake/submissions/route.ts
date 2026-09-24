import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertClientUploadAccess } from "@/lib/submissions";
import { createSubmission, listResumable } from "@/lib/submissionHandlers";

export const runtime = "nodejs";

/** Start a file. The seat door; /api/send/[token] is the other one. */
export async function POST(req: NextRequest) {
  const access = await assertClientUploadAccess(await getSessionUser());
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return createSubmission(access, req);
}

/** This seat's own unfinished uploads — powers the resume UI. */
export async function GET() {
  const access = await assertClientUploadAccess(await getSessionUser());
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return listResumable(access);
}
