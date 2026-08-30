import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveSubmissionPath, streamFile } from "@/lib/media";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return new Response(null, { status: 401 });

  const submission = await db.submission.findUnique({ where: { id } });
  if (!submission || submission.status !== "COMPLETE") return new Response(null, { status: 404 });

  const filePath = await resolveSubmissionPath(submission.relPath).catch(() => null);
  if (!filePath) return new Response(null, { status: 404 });

  try {
    return streamFile(filePath, req.headers.get("range"), { download: submission.filename });
  } catch {
    return new Response(null, { status: 404 });
  }
}
