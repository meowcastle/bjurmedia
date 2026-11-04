import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { emailLogoUrl } from "@/lib/emailLogo";
import { sendPasswordChangedEmail, sendPasswordLinkEmail } from "@/lib/mailer";
import { rateLimit } from "@/lib/rateLimit";
import { safeNext } from "@/lib/nextPath";

/**
 * "Forgot password" for client logins: an emailed link, good once for 30 minutes, that
 * lets the person choose a new password and signs them in.
 *
 * Who gets a link: a client login that could sign in right now, including one that has
 * never signed in (a lost welcome email is the commonest reason to be here). Never staff,
 * never a deactivated login, never a login whose every client is switched off. The
 * caller answers the same whatever happens here, so none of this is visible from outside.
 */

export const RESET_TTL_MS = 30 * 60_000;
const PER_EMAIL = { limit: 3, windowMs: 60 * 60_000 };

export const MIN_PASSWORD = 8;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function portalUrl() {
  return (process.env.PORTAL_URL ?? "https://portal.bjur.nyc").replace(/\/$/, "");
}

type Deps = {
  sendLink: typeof sendPasswordLinkEmail;
  sendChanged: typeof sendPasswordChangedEmail;
};

/** The client a multi-client login lands on, by the same rule as sign in. */
async function landingClient(userId: string) {
  const memberships = await db.clientMember.findMany({
    where: { userId, client: { status: "ACTIVE" } },
    include: { client: { select: { id: true, name: true, logoUrl: true } } },
  });
  return memberships.map((m) => m.client).sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
}

export type ResetRequest =
  | { outcome: "sent"; user: { name: string; email: string } }
  | { outcome: "ineligible"; user: { name: string; email: string; deactivated: boolean; isAdmin: boolean } }
  | { outcome: "limited" | "unknown" };

export async function requestPasswordReset(
  rawEmail: string,
  next?: string | null,
  deps: Partial<Deps> = {}
): Promise<ResetRequest> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return { outcome: "unknown" };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isAdmin: true, deactivatedAt: true },
  });
  if (!user) return { outcome: "unknown" };

  const client = user.isAdmin || user.deactivatedAt ? null : await landingClient(user.id);
  if (!client) {
    return {
      outcome: "ineligible",
      user: { name: user.name, email: user.email, deactivated: !!user.deactivatedAt, isAdmin: user.isAdmin },
    };
  }

  // Per address, on top of the route's per-IP limit: nobody gets to fill a client's inbox.
  if (!rateLimit(`forgot-email:${email}`, PER_EMAIL.limit, PER_EMAIL.windowMs).allowed) {
    return { outcome: "limited" };
  }

  // One live link at a time: asking again makes the older ones useless.
  await db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });

  const token = randomBytes(32).toString("hex");
  await db.passwordReset.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });

  const to = safeNext(next ?? undefined);
  const resetUrl = `${portalUrl()}/reset/${token}${to && to !== "/" ? `?next=${encodeURIComponent(to)}` : ""}`;
  await (deps.sendLink ?? sendPasswordLinkEmail)(user.email, {
    clientName: client.name,
    recipientName: user.name,
    signInEmail: user.email,
    resetUrl,
    logoUrl: emailLogoUrl(client.logoUrl),
  });

  await db.activity.create({ data: { actor: user.email, action: "was emailed a password reset link" } });
  return { outcome: "sent", user: { name: user.name, email: user.email } };
}

/** The reset row a token names, if it can still be used. Read only: the page uses it. */
export async function findUsableReset(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await db.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, isAdmin: true, deactivatedAt: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date()) return null;
  if (row.user.isAdmin || row.user.deactivatedAt) return null;
  return row;
}

export type ResetResult =
  | { ok: true; userId: string; activeClientId: string }
  | { ok: false; error: "expired" | "short" };

/**
 * Spend a link on a new password. Claims the row before anything else, so two tabs
 * submitting the same link cannot both get through. Every session the login had is
 * ended; the caller opens a fresh one for this browser.
 */
export async function completePasswordReset(
  token: string,
  password: string,
  deps: Partial<Deps> = {}
): Promise<ResetResult> {
  if (password.length < MIN_PASSWORD) return { ok: false, error: "short" };

  const row = await findUsableReset(token);
  if (!row) return { ok: false, error: "expired" };
  const client = await landingClient(row.userId);
  if (!client) return { ok: false, error: "expired" };

  const claimed = await db.passwordReset.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, error: "expired" };

  await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password), mustChangePassword: false },
    }),
    db.session.deleteMany({ where: { userId: row.userId } }),
    db.passwordReset.deleteMany({ where: { userId: row.userId, usedAt: null } }),
    db.activity.create({ data: { actor: row.user.email, action: "chose a new password from a reset link" } }),
  ]);

  // A heads-up, not part of the change: a failed send must not undo a password that is
  // already set, so it is logged and left.
  try {
    await (deps.sendChanged ?? sendPasswordChangedEmail)(row.user.email, {
      clientName: client.name,
      recipientName: row.user.name,
      portalUrl: portalUrl(),
      logoUrl: emailLogoUrl(client.logoUrl),
    });
  } catch (err) {
    console.error("[password-reset] changed notice failed", err);
  }

  return { ok: true, userId: row.userId, activeClientId: client.id };
}
