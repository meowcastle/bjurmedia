import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Every client upload batch for a project, each with its files — the admin's "what
 * came in" view. Grouped by batch (not a flat file list) since that's the actual unit
 * a client's drop lands as on disk: one dated, SMB-browsable folder per session.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({ where: { id: projectId }, include: { client: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const batches = await db.uploadBatch.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true } },
      submissions: { orderBy: { relativePath: "asc" } },
    },
  });

  return NextResponse.json({
    batches: batches
      .filter((b) => b.submissions.length > 0)
      .map((b) => ({
        id: b.id,
        label: b.label,
        // Container-internal path (MEDIA_ROOT-rooted) — same convention the existing
        // inboxPath field already shows on this admin page; translate to the host NAS
        // path the way you already do for that one.
        dirPath: path.join("_submissions", project.client.username, projectId, b.label),
        uploaderName: b.user.name,
        createdAt: b.createdAt.toISOString(),
        files: b.submissions.map((s) => ({
          id: s.id,
          relativePath: s.relativePath,
          sizeBytes: s.sizeBytes.toString(),
          receivedBytes: s.receivedBytes.toString(),
          status: s.status,
          completedAt: s.completedAt?.toISOString() ?? null,
        })),
      })),
  });
}
