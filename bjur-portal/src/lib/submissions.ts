import path from "path";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sanitizeFilename } from "@/lib/uploads";

export type SubmissionAccess =
  | {
      ok: true;
      /**
       * Null for anyone who arrived through a send link. They have no account, so the
       * scope key is the request instead — see scopeMatches below. Every check that used
       * to read "is this batch yours" now asks "is this batch in your scope", which is
       * the same question for a seat and a different one for a stranger with a link.
       */
      userId: string | null;
      userName: string;
      requestId: string | null;
      senderName: string | null;
      /**
       * Intake is scoped to the client, not a project. Footage arrives long before anyone
       * knows what it will be cut into, and a sender should never have to answer that
       * question to send a file.
       */
      client: { id: string; username: string; name: string };
    }
  | { ok: false; status: number };

type OkAccess = Extract<SubmissionAccess, { ok: true }>;

/** Whether a batch belongs to whoever is asking — by seat, or by send link. */
export function scopeMatches(access: OkAccess, batch: { userId: string | null; requestId: string | null }) {
  return access.userId ? batch.userId === access.userId : batch.requestId === access.requestId;
}

/**
 * A signed-in seat sending footage for their own client.
 *
 * No open request needed and no project involved. The old gate required an open
 * SubmissionRequest on a specific project, which locked a client out of sending anything
 * the moment nobody had remembered to make one — and it cost Xavier two weeks once. A
 * seat sending to their own client is self-evidently allowed; the request exists to let
 * people *without* a seat send, which is a different question.
 */
export async function assertClientUploadAccess(
  session: SessionUser | null
): Promise<SubmissionAccess> {
  if (!session?.clientId) return { ok: false, status: 401 };

  const client = await db.client.findUnique({ where: { id: session.clientId } });
  if (!client || client.status !== "ACTIVE") return { ok: false, status: 404 };

  // The switch, checked here rather than by hiding the tab, because every upload route
  // funnels through this one function — a hand-rolled POST is refused the same way a
  // click would be. Send links are unaffected: they are their own permission.
  if (!client.footageUploads) return { ok: false, status: 403 };

  return {
    ok: true,
    userId: session.id,
    userName: session.name,
    requestId: null,
    senderName: null,
    client: { id: client.id, username: client.username, name: client.name },
  };
}

const MAX_PATH_SEGMENTS = 12;
const MAX_PATH_LENGTH = 1024;

/**
 * Validates a client-supplied folder-relative path (from webkitRelativePath or a
 * walked FileSystemEntry) before it's ever joined onto a filesystem path. This is
 * belt-and-suspenders ahead of resolveSubmissionPath()'s own traversal/symlink guard
 * in src/lib/media.ts — reject anything shaped like an escape attempt here, at the
 * point where we still have the individual segments, rather than relying solely on
 * the final resolved-path check.
 */
export function validateRelativePath(relativePath: string): string[] | null {
  if (!relativePath || relativePath.length > MAX_PATH_LENGTH) return null;
  const segments = relativePath.split(/[/\\]/).map((s) => s.trim());
  if (segments.length === 0 || segments.length > MAX_PATH_SEGMENTS) return null;
  // Reject raw segments (a leading/trailing/doubled slash, ".", "..") before
  // sanitizeFilename() ever sees them — it falls back to a literal "upload" for an
  // empty segment (a filename-cleanup default that's correct for its own callers),
  // which would otherwise silently swallow a leading "/" instead of rejecting it.
  if (segments.some((s) => !s || s === "." || s === "..")) return null;
  return segments.map((s) => sanitizeFilename(s));
}

/**
 * Relative to SUBMISSIONS_ROOT — resolve with resolveSubmissionPath() before use.
 *
 * Client, then batch. The project id used to sit in the middle, which is how 302 GB of
 * rushes ended up filed under a project that was really a review job.
 */
export function submissionRelPath(
  clientUsername: string,
  batchName: string,
  relativePathSegments: string[]
) {
  return path.join(clientUsername, batchName, ...relativePathSegments);
}

function todayLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Picks the on-disk folder name for a new upload session: "YYYY-MM-DD - Uploader
 * Name", the same shape a colorist would hand-name a card dump — so the bin reads
 * naturally when browsed over SMB. Appends " (2)", " (3)", ... on same-day collision
 * (the same person opening the upload page more than once today) rather than reusing
 * a batch across page visits, since re-associating with an existing batch only
 * happens deliberately via a resumed submission's own batchId (see the chunk route).
 */
export async function generateBatchName(
  clientId: string,
  uploaderName: string,
  typed?: string | null
) {
  // What the sender typed wins. They know what is in it; we only ever guessed from who
  // was sending and when. Blank falls back to the old shape, which still reads naturally
  // over SMB.
  const base = sanitizeFilename(typed?.trim() || `${todayLabel()} - ${uploaderName}`);
  const existing = await db.uploadBatch.findMany({
    where: { clientId, name: { startsWith: base } },
    select: { name: true },
  });
  if (!existing.some((b) => b.name === base)) return base;
  let n = 2;
  while (existing.some((b) => b.name === `${base} (${n})`)) n++;
  return `${base} (${n})`;
}


/**
 * The public way in: a send link, resolved by token, with no session at all.
 *
 * Returns the same shape as the seat path so every handler downstream is written once.
 * A closed or expired request is refused here — the page renders its own "this link is
 * closed" shell, but the API must not keep accepting bytes against it.
 */
export async function assertRequestUploadAccess(
  token: string,
  senderName: string | null = null
): Promise<SubmissionAccess> {
  const request = await db.submissionRequest.findUnique({
    where: { token },
    include: { client: true },
  });
  if (!request) return { ok: false, status: 404 };
  if (request.closedAt || request.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 410 };
  }

  return {
    ok: true,
    userId: null,
    userName: senderName?.trim() || request.name,
    requestId: request.id,
    senderName: senderName?.trim() || null,
    client: {
      id: request.client.id,
      username: request.client.username,
      name: request.client.name,
    },
  };
}
