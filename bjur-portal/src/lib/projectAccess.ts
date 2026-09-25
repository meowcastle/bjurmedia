import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

type Role = "OWNER" | "DOWNLOADER" | "VIEWER";

export type ProjectAccess = { allowed: false } | { allowed: true; role: Role };

/**
 * Project ids a client session may see, or null if unrestricted (no
 * ProjectMember rows for this user — falls back to plain client-scoping).
 */
export async function getAccessibleProjectIds(session: SessionUser): Promise<string[] | null> {
  if (session.isAdmin) return null;

  const memberships = await db.projectMember.findMany({
    where: { userId: session.id },
    select: { projectId: true },
  });
  if (memberships.length === 0) return null;

  // Being put on a film's review cycle is a grant in its own right, and it is the only
  // one the studio issues for a Film project — there is no ProjectMember row to go with
  // it. Without this, a reviewer who is restricted to one delivery cannot see the film
  // they are reviewing anywhere in the portal, and the cut-ready email is their only way
  // in. Revoked reviewers are excluded, so taking somebody off the cycle still hides it.
  const reviewing = await db.reviewer.findMany({
    where: { userId: session.id, revokedAt: null },
    select: { projectId: true },
  });

  return [...new Set([...memberships, ...reviewing].map((m) => m.projectId))];
}

/**
 * Single-project gate: same-client ownership, then — for a restricted login
 * (one with any ProjectMember rows) — membership in this specific project.
 * Resolves the effective role to enforce for this project.
 */
export async function getProjectAccess(
  session: SessionUser,
  project: { id: string; clientId: string }
): Promise<ProjectAccess> {
  if (session.isAdmin) return { allowed: true, role: "OWNER" };
  if (session.clientId !== project.clientId) return { allowed: false };

  const memberships = await db.projectMember.findMany({
    where: { userId: session.id },
    select: { projectId: true, role: true },
  });
  if (memberships.length === 0) return { allowed: true, role: session.role };

  const membership = memberships.find((m) => m.projectId === project.id);
  if (!membership) return { allowed: false };
  return { allowed: true, role: membership.role };
}
