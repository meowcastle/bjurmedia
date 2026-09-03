import { createWriteStream } from "fs";
import { stat, truncate } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveSubmissionPath } from "@/lib/media";
import { pumpToFile } from "@/lib/uploads";
import { postSlackEvent } from "@/lib/slack";
import { assertProjectUploadAccess } from "@/lib/submissions";

export const runtime = "nodejs";

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Append one chunk to a submission in progress. The client always advances from the
 * `receivedBytes` this route returns (not a local counter) — the server, not the
 * browser, is the source of truth for how much has actually landed, so a client that
 * reloaded mid-upload and lost its own bookkeeping can resume correctly just by
 * re-querying GET /submissions and trusting the number back.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const { id: projectId, submissionId } = await params;
  const session = await getSessionUser();
  const access = await assertProjectUploadAccess(session, projectId);
  if (!access.ok) return new NextResponse(null, { status: access.status });

  const submission = await db.submission.findUnique({ where: { id: submissionId } });
  if (!submission || submission.projectId !== projectId || submission.userId !== access.userId) {
    return new NextResponse(null, { status: 404 });
  }
  if (submission.status !== "UPLOADING") {
    return NextResponse.json({ error: `Submission is already ${submission.status.toLowerCase()}.` }, { status: 409 });
  }

  const contentRange = req.headers.get("content-range");
  const match = contentRange ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange) : null;
  if (!match) {
    return NextResponse.json({ error: "Missing or malformed Content-Range header." }, { status: 400 });
  }
  const start = parseInt(match[1], 10);

  // The client always trusts our receivedBytes over its own guess — a mismatch means
  // it's re-sending a chunk we already have (a retried request after a response was
  // lost) or has drifted out of sync after a reload. Either way, reject rather than
  // risk appending a duplicate/overlapping range, and hand back the real number so it
  // can realign.
  const currentReceived = Number(submission.receivedBytes);
  if (start !== currentReceived) {
    return NextResponse.json({ receivedBytes: currentReceived, complete: false }, { status: 409 });
  }

  if (!req.body) {
    return NextResponse.json({ error: "Empty request body." }, { status: 400 });
  }

  const absPath = await resolveSubmissionPath(submission.relPath).catch(() => null);
  if (!absPath) return new NextResponse(null, { status: 404 });

  const reader = req.body.getReader();
  let writeStream: ReturnType<typeof createWriteStream> | undefined;
  try {
    // Disk can legitimately sit AHEAD of receivedBytes. If a previous chunk's bytes
    // landed but the process died before the db.submission.update() below, the file
    // holds data the DB never acknowledged — and this NAS stops containers on its own,
    // so that window does get hit. Appending from there would write the new chunk past
    // the bytes we already have, duplicating that range and pushing the file beyond
    // sizeBytes, at which point `complete` can never become true and the upload wedges
    // (with a corrupt file) instead of resuming. Roll disk back to the offset we
    // actually committed, so the append below starts exactly where the client thinks.
    await truncate(absPath, currentReceived);
    writeStream = createWriteStream(absPath, { flags: "a" });
    await pumpToFile(reader, writeStream);
  } catch (err) {
    writeStream?.destroy();
    return NextResponse.json({ error: `Chunk failed: ${(err as Error).message.slice(0, 200)}` }, { status: 500 });
  }

  // Trust the file on disk, not the chunk's own declared size — same "verify, don't
  // assume" check the admin upload route does against Content-Length.
  const receivedBytes = (await stat(absPath)).size;
  const totalBytes = Number(submission.sizeBytes);
  const complete = receivedBytes === totalBytes;

  await db.submission.update({
    where: { id: submission.id },
    data: {
      receivedBytes,
      ...(complete ? { status: "COMPLETE" as const, completedAt: new Date() } : {}),
    },
  });

  if (complete) {
    const size = formatBytes(totalBytes);
    await db.activity.create({
      data: {
        actor: access.project.client.name,
        action: `uploaded "${submission.filename}" (${size}) to ${access.project.title}`,
      },
    });
    await postSlackEvent({
      clientId: access.project.clientId,
      toggle: "autoSubmission",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:inbox_tray: *Client upload — ${access.project.client.name}*\n*${access.project.title}*\n${submission.filename} · ${size}`,
          },
        },
      ],
    });
  }

  return NextResponse.json({ receivedBytes, complete });
}
