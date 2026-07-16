import argon2 from "argon2";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const SESSION_COOKIE = "bjur_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  clientId: string | null;
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
  isAdmin: boolean;
  sessionId: string;
  mustChangePassword: boolean;
};

export async function createSession(
  userId: string,
  meta: { device: string; ip?: string; location?: string }
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

  const age = Date.now() - session.createdAt.getTime();
  if (age > SESSION_TTL_MS) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // touch lastSeenAt, best-effort
  db.session
    .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    clientId: session.user.clientId,
    role: session.user.role,
    isAdmin: session.user.isAdmin,
    sessionId: session.id,
    mustChangePassword: session.user.mustChangePassword,
  };
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
