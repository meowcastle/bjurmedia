import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

/** ~12 chars, url-safe. Handed out once, forced to change on first sign-in. */
export function genTempPassword() {
  return randomBytes(9).toString("base64url");
}

/**
 * Revokes a login without destroying it: every session is killed, sign-in is
 * blocked, and the row drops off the seat/admin lists. Licenses, upload batches
 * and submissions pointing at this user are deliberately left alone — they're
 * records of what actually happened and still name whoever did it. Re-adding the
 * same email reactivates this row (see reactivateSeat) instead of colliding on it.
 */
export async function deactivateUser(userId: string) {
  const [user] = await db.$transaction([
    db.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } }),
    db.session.deleteMany({ where: { userId } }),
  ]);

  return user;
}

/**
 * Creates a staff/admin login — the UI equivalent of prisma/create-admin.ts, with
 * a generated temp password instead of one chosen up front. No clientId, so this
 * user sees the staff surface and never a client portal.
 */
export async function createAdmin(opts: { name: string; email: string }) {
  const tempPassword = genTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await db.user.create({
    data: {
      name: opts.name,
      email: opts.email.toLowerCase(),
      passwordHash,
      isAdmin: true,
      role: "OWNER",
      mustChangePassword: true,
    },
  });

  return { user, tempPassword };
}

/** Restores a previously revoked admin login with a fresh temp password. */
export async function reactivateAdmin(opts: { userId: string; name: string }) {
  const tempPassword = genTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await db.user.update({
    where: { id: opts.userId },
    data: {
      name: opts.name,
      passwordHash,
      isAdmin: true,
      deactivatedAt: null,
      mustChangePassword: true,
    },
  });

  return { user, tempPassword };
}
