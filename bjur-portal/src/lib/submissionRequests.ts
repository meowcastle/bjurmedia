import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * How long a send link stays usable. Reopening extends it by the same amount rather than
 * from the original date — a link reopened a month later is being reopened because
 * someone still needs to send, not to give them the two days that were left.
 */
export const SUBMISSION_REQUEST_TTL_DAYS = parseInt(
  process.env.SUBMISSION_REQUEST_TTL_DAYS ?? "14",
  10
);

export function ttlFromNow(now = new Date()) {
  return new Date(now.getTime() + SUBMISSION_REQUEST_TTL_DAYS * 86_400_000);
}

/**
 * The token in the URL. Long and random because it is the only thing standing between
 * the public internet and write access to a client's project folder — there is no login
 * behind it, by design.
 */
export function newRequestToken() {
  return randomBytes(24).toString("base64url");
}

/** Folder- and URL-safe form of a name, for both the on-disk folder and the link. */
export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "files"
  );
}

export type RequestState = "open" | "closed" | "expired";

export function stateOf(
  request: { closedAt: Date | null; expiresAt: Date },
  now = new Date()
): RequestState {
  if (request.closedAt) return "closed";
  if (request.expiresAt.getTime() <= now.getTime()) return "expired";
  return "open";
}

/**
 * Resolve a send link. Returns null for anything that should 404 — closed, expired, or
 * simply wrong — deliberately without saying which: the page is public, and telling a
 * stranger they found a real-but-closed link is more than they need to know.
 */
export async function resolveOpenRequest(token: string) {
  const request = await db.submissionRequest.findUnique({
    where: { token },
    include: { project: { include: { client: { select: { name: true, username: true } } } } },
  });
  if (!request) return null;
  if (stateOf(request) !== "open") return null;
  return request;
}
