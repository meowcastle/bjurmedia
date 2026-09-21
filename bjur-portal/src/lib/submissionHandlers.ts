import { createWriteStream } from "fs";
import { mkdir, stat, truncate, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSubmissionPath } from "@/lib/media";
import { pumpToFile } from "@/lib/uploads";
import { postSlackEvent } from "@/lib/slack";
import { scopeMatches, submissionRelPath, validateRelativePath, type SubmissionAccess } from "@/lib/submissions";

type OkAccess = Extract<SubmissionAccess, { ok: true }>;

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * The resumable upload, written once.
 *
 * There are two doors into it — a client seat, and a public send link with no session —
 * and exactly one implementation behind them. The chunking, the truncate-to-committed
 * dance and the disk-is-truth accounting are the parts of this codebase most expensive
 * to get subtly wrong, so they do not get a second copy that drifts.
 */

/** Opens a new batch: one on-disk folder everything dropped this visit shares. */
export async function startBatch(access: OkAccess, label: string) {
  const batch = await db.uploadBatch.create({
    data: {
      projectId: access.project.id,
      userId: access.userId,
      requestId: access.requestId,
      senderName: access.senderName,
      label,
    },
  });
  return NextResponse.json({ id: batch.id, label: batch.label });
}

/** Starts one file — the row, and an empty file to append chunks to. */
export async function createSubmission(access: OkAccess, req: NextRequest) {
  const projectId = access.project.id;
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
  if (!batch || batch.projectId !== projectId || !scopeMatches(access, batch)) {
    return NextResponse.json({ error: "Unknown upload batch." }, { status: 404 });
  }

  const relativePath = segments.join("/");
  const filename = segments[segments.length - 1];

  /**
   * A file this project already has, at the same path and the same size, is not sent
   * again — it is reported as already there.
   *
   * Without this, re-dropping a folder to resume one unfinished file re-queued every
   * finished one beside it. The client adopts the in-progress batch, so those land at
   * the *same* on-disk paths, and the empty-file write below truncates the good copy to
   * zero before re-sending it. On a delivery of forty 2GB rushes over a home uplink that
   * is a week of someone's life and their only copy, destroyed by dragging in a folder
   * the page itself tells them to re-drop.
   *
   * Matched on path + size, which is the same key the client resumes on. A genuinely
   * different file at the same name has a different size and still uploads.
   */
  const alreadyHave = await db.submission.findFirst({
    where: { projectId, relativePath, sizeBytes, status: "COMPLETE" },
    select: { id: true },
  });
  if (alreadyHave) {
    return NextResponse.json({ id: alreadyHave.id, alreadyComplete: true });
  }

  const submission = await db.submission.create({
    data: {
      projectId,
      userId: access.userId,
      batchId,
      relativePath,
      filename,
      relPath: "", // filled in below: needs nothing from this row itself
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

/** Whatever this sender still has in flight — powers the resume UI. */
export async function listResumable(access: OkAccess) {
  const batches = await db.uploadBatch.findMany({
    where: access.userId
      ? { projectId: access.project.id, userId: access.userId }
      : { projectId: access.project.id, requestId: access.requestId },
    select: { id: true },
  });

  const submissions = await db.submission.findMany({
    where: { batchId: { in: batches.map((b) => b.id) }, status: "UPLOADING" },
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

/**
 * Append one chunk. The client always advances from the `receivedBytes` this returns
 * (not a local counter) — the server, not the browser, is the source of truth for how
 * much has actually landed, so a client that reloaded mid-upload and lost its own
 * bookkeeping can resume correctly just by re-querying and trusting the number back.
 */
export async function appendChunk(access: OkAccess, req: NextRequest, submissionId: string) {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { batch: { select: { userId: true, requestId: true } } },
  });
  if (!submission || submission.projectId !== access.project.id || !scopeMatches(access, submission.batch)) {
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
    const from = access.senderName ? ` from ${access.senderName}` : "";
    await db.activity.create({
      data: {
        actor: access.project.client.name,
        action: `uploaded "${submission.filename}" (${size}) to ${access.project.title}${from}`,
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
            text: `:inbox_tray: *Client upload — ${access.project.client.name}*\n*${access.project.title}*\n${submission.filename} · ${size}${from}`,
          },
        },
      ],
    });
  }

  return NextResponse.json({ receivedBytes, complete });
}
