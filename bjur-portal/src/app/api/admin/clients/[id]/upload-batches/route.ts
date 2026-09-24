import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Everything a client has sent, batch by batch — the admin's "what came in" view.
 *
 * Grouped by batch rather than a flat file list because that is the unit it lands as on
 * disk: one named, SMB-browsable folder per session. Per client, not per project: what a
 * batch eventually gets cut into is a separate question nobody has to answer to send it.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const batches = await db.uploadBatch.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true } },
      request: { select: { name: true } },
      submissions: { orderBy: { relativePath: "asc" } },
    },
  });

  return NextResponse.json({
    batches: batches
      .filter((b) => b.submissions.length > 0)
      .map((b) => {
        const complete = b.submissions.filter((s) => s.status === "COMPLETE").length;
        const received = b.submissions.reduce((n, s) => n + Number(s.receivedBytes), 0);
        // What is actually in it, for a glance: "R3D · WAV · MP4".
        const kinds = [
          ...new Set(
            b.submissions
              .map((s) => path.extname(s.filename).replace(".", "").toUpperCase())
              .filter(Boolean)
          ),
        ].slice(0, 4);

        return {
          id: b.id,
          name: b.name,
          // Container-internal path; the client page translates it to the SMB address
          // somebody can actually paste into Finder.
          dirPath: path.join("_submissions", client.username, b.name),
          // Null for anyone who arrived through a send link rather than a seat.
          uploaderName: b.user?.name ?? b.senderName ?? "Someone",
          via: b.requestId ? ("send link" as const) : ("portal" as const),
          requestName: b.request?.name ?? null,
          fileCount: b.submissions.length,
          completeCount: complete,
          receivedBytes: String(received),
          kinds,
          filesDeletedAt: b.filesDeletedAt?.toISOString() ?? null,
          status: b.filesDeletedAt
            ? ("FILES_DELETED" as const)
            : complete < b.submissions.length
              ? ("RECEIVING" as const)
              : ("ON_SERVER" as const),
          createdAt: b.createdAt.toISOString(),
          files: b.submissions.map((s) => ({
            id: s.id,
            relativePath: s.relativePath,
            sizeBytes: s.sizeBytes.toString(),
            receivedBytes: s.receivedBytes.toString(),
            status: s.status,
            // Last time a byte actually landed. An upload that has not moved in a long
            // while is abandoned, not in progress, and the row says so rather than
            // showing a progress line that will never finish.
            updatedAt: s.updatedAt.toISOString(),
            completedAt: s.completedAt?.toISOString() ?? null,
          })),
        };
      }),
  });
}
