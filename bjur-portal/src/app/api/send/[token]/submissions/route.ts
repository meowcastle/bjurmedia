import { NextRequest, NextResponse } from "next/server";
import { assertRequestUploadAccess } from "@/lib/submissions";
import { createSubmission, listResumable } from "@/lib/submissionHandlers";

export const runtime = "nodejs";

/**
 * The public door. No session: the token in the URL is the whole credential, which is
 * why it is long and random and why a closed or expired request is refused here even
 * though the page still renders a shell for it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await assertRequestUploadAccess(token);
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return createSubmission(access, req);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await assertRequestUploadAccess(token);
  if (!access.ok) return new NextResponse(null, { status: access.status });
  return listResumable(access);
}
