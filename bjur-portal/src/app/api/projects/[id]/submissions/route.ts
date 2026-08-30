import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveSubmissionPath } from "@/lib/media";
import { assertProjectUploadAccess, submissionRelPath, validateRelativePath } from "@/lib/submissions";

export const runtime = "nodejs";

/** Start a new client submission — creates the row and an empty file to append chunks to. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  const access = await assertProjectUploadAccess(session, projectId);
  if (!access.ok) return new NextResponse(null, { status: access.status });

  const body = await req.json().catch(() => null);
  const batchId = typeof body?.batchId === "string" ? body.batchId : null;
  const sizeBytes = typeof body?.sizeBytes === "number" ? body.sizeBytes : null;
  const segments = typeof body?.relativePath === "string" ? validateRelativePath(body.relativePath) : null;
  if (!batchId || !segments || sizeBytes == null || sizeBytes <= 0) {
    return NextResponse.json(
      { error: "batchId, a valid relativePath, and a positive sizeBytes are required." },
      { status: 400 }
    );
  }

  const batch = await db.uploadBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.projectId !== projectId || batch.userId !== access.userId) {
    return NextResponse.json({ error: "Unknown upload batch." }, { status: 404 });
  }

  const relativePath = segments.join("/");
  const filename = segments[segments.length - 1];

  const submission = await db.submission.create({
    data: {
      projectId,
      userId: access.userId,
      batchId,
      relativePath,
      filename,
      relPath: "", // filled in below, same reason as before: needs nothing from this row itself
      sizeBytes,
    },
  });

  const relPath = submissionRelPath(access.project.client.username, projectId, batch.label, segments);
  const absPath = await resolveSubmissionPath(relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, Buffer.alloc(0));

  await db.submission.update({ where: { id: submission.id }, data: { relPath } });

  return NextResponse.json({ id: submission.id });
}

/** This client's own non-complete submissions for this project — powers the resume UI. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  const access = await assertProjectUploadAccess(session, projectId);
  if (!access.ok) return new NextResponse(null, { status: access.status });

  const submissions = await db.submission.findMany({
    where: { projectId, userId: access.userId, status: "UPLOADING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, batchId: true, relativePath: true, filename: true, sizeBytes: true, receivedBytes: true },
  });

  return NextResponse.json({
    submissions: submissions.map((s) => ({
      id: s.id,
      batchId: s.batchId,
      relativePath: s.relativePath,
      filename: s.filename,
      sizeBytes: s.sizeBytes.toString(),
      receivedBytes: s.receivedBytes.toString(),
    })),
  });
}
