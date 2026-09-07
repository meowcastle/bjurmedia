import argon2 from "argon2";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const SESSION_COOKIE = "bjur_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type ClientMembership = {
  clientId: string;
  clientName: string;
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  /**
   * The client this session is *currently looking at*, not the only one it may see.
   * A seat can belong to several; everything that scopes data by clientId keeps
   * working unchanged because this resolves to one of them.
   */
  clientId: string | null;
  /** The role for the active client — roles are per membership, not per account. */
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
  /** Every client this seat can reach, for the switcher. Empty for staff. */
  memberships: ClientMembership[];
  isAdmin: boolean;
  sessionId: string;
  mustChangePassword: boolean;
};

export async function createSession(
  userId: string,
  meta: { device: string; ip?: string; location?: string; activeClientId?: string }
) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  await db.session.create({
    data: {
      userId,
      tokenHash,
      device: meta.device,
      ip: meta.ip,
      location: meta.location,
      activeClientId: meta.activeClientId,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return token;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;

  // Revocation deletes a user's sessions, so this is belt-and-braces against one
  // created in the same instant as the revoke.
  if (session.user.deactivatedAt) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const age = Date.now() - session.createdAt.getTime();
  if (age > SESSION_TTL_MS) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // touch lastSeenAt, best-effort
  db.session
    .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  const memberships = (
    await db.clientMember.findMany({
      where: { userId: session.user.id, client: { status: "ACTIVE" } },
      select: { clientId: true, role: true, client: { select: { name: true } } },
      orderBy: { client: { name: "asc" } },
    })
  ).map((m) => ({ clientId: m.clientId, clientName: m.client.name, role: m.role }));

  // The stored choice, but only while it is still a membership — a seat removed from a
  // client must not keep seeing it because their session remembers it. Falling back to
  // the first membership means a revoked selection degrades to a working portal rather
  // than a dead one.
  const active =
    memberships.find((m) => m.clientId === session.activeClientId) ?? memberships[0] ?? null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    clientId: active?.clientId ?? null,
    role: active?.role ?? session.user.role,
    memberships,
    isAdmin: session.user.isAdmin,
    sessionId: session.id,
    mustChangePassword: session.user.mustChangePassword,
  };
}

/**
 * Switches which client a session is viewing. Returns false when the seat is not a
 * member of the target — the check belongs here rather than in the route, so every
 * caller gets it.
 */
export async function setActiveClient(sessionId: string, userId: string, clientId: string) {
  const member = await db.clientMember.findUnique({
    where: { userId_clientId: { userId, clientId } },
  });
  if (!member) return false;
  await db.session.update({ where: { id: sessionId }, data: { activeClientId: clientId } });
  return true;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke all sessions for a user except the current one (e.g. on password change). */
export async function revokeOtherSessions(userId: string) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const keepHash = token ? hashToken(token) : undefined;

  await db.session.deleteMany({
    where: { userId, tokenHash: keepHash ? { not: keepHash } : undefined },
  });
}
