import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertProjectUploadAccess, generateBatchLabel } from "@/lib/submissions";

export const runtime = "nodejs";

/** Starts a new upload session — one on-disk folder all files dropped this visit share. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  const access = await assertProjectUploadAccess(session, projectId);
  if (!access.ok) return new NextResponse(null, { status: access.status });

  const label = await generateBatchLabel(projectId, access.userName);
  const batch = await db.uploadBatch.create({
    data: { projectId, userId: access.userId, label },
  });

  return NextResponse.json({ id: batch.id, label: batch.label });
}
