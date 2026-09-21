import path from "path";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectAccess } from "@/lib/projectAccess";
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
      project: { id: string; title: string; clientId: string; client: { username: string; name: string } };
    }
  | { ok: false; status: number };

type OkAccess = Extract<SubmissionAccess, { ok: true }>;

/** Whether a batch belongs to whoever is asking — by seat, or by send link. */
export function scopeMatches(access: OkAccess, batch: { userId: string | null; requestId: string | null }) {
  return access.userId ? batch.userId === access.userId : batch.requestId === access.requestId;
}

/**
 * Gate for the client-facing submission routes: session -> same-client/per-project
 * access (any role — uploading source material isn't tied to download/purchase
 * permissions) -> project not expired. Unlike asset access, there's no DRAFT check
 * here on purpose: a client may need to send raw footage before the studio has
 * delivered anything back, i.e. before the project has ever gone LIVE.
 */
export async function assertProjectUploadAccess(
  session: SessionUser | null,
  projectId: string
): Promise<SubmissionAccess> {
  if (!session?.clientId) return { ok: false, status: 401 };

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) return { ok: false, status: 404 };

  const access = await getProjectAccess(session, project);
  if (!access.allowed) return { ok: false, status: 404 };

  // A project accepts footage only while it has an open request. Replaced the old
  // clientUploads boolean: intake is now a thing you ask for by name and close when it
  // has served its purpose, rather than a switch left on and forgotten. Enforced here
  // rather than by hiding the button, because every upload route funnels through this
  // one function — a hand-rolled POST is refused the same way a click would be. 403
  // rather than 404: the project exists and they can see it, they just cannot send to it.
  const openRequest = await db.submissionRequest.findFirst({
    where: { projectId: project.id, closedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!openRequest) {
    return { ok: false, status: 403 };
  }

  if (project.expiresAt && project.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 410 };
  }

  return { ok: true, userId: session.id, userName: session.name, requestId: null, senderName: null, project };
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

/** Relative to SUBMISSIONS_ROOT — resolve with resolveSubmissionPath() before use. */
export function submissionRelPath(
  clientUsername: string,
  projectId: string,
  batchLabel: string,
  relativePathSegments: string[]
) {
  return path.join(clientUsername, projectId, batchLabel, ...relativePathSegments);
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
export async function generateBatchLabel(projectId: string, uploaderName: string) {
  const base = sanitizeFilename(`${todayLabel()} - ${uploaderName}`);
  const existing = await db.uploadBatch.findMany({
    where: { projectId, label: { startsWith: base } },
    select: { label: true },
  });
  if (!existing.some((b) => b.label === base)) return base;
  let n = 2;
  while (existing.some((b) => b.label === `${base} (${n})`)) n++;
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
    include: { project: { include: { client: true } } },
  });
  if (!request) return { ok: false, status: 404 };
  if (request.closedAt || request.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 410 };
  }
  if (request.project.expiresAt && request.project.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 410 };
  }

  return {
    ok: true,
    userId: null,
    userName: senderName?.trim() || request.name,
    requestId: request.id,
    senderName: senderName?.trim() || null,
    project: request.project,
  };
}
