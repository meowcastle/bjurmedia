import { db } from "@/lib/db";
import { setActiveClient, type SessionUser } from "@/lib/auth";

type Role = "OWNER" | "DOWNLOADER" | "VIEWER";

export type ProjectAccess = { allowed: false } | { allowed: true; role: Role };

// Restrictions are per client. A seat can belong to several clients, and a ProjectMember
// row only says something about the client its project belongs to: being limited to two
// projects on one client must not hide every project on another client the same seat
// owns outright. Reading the rows across all clients did exactly that — an owner on one
// client, restricted on another, saw an empty project list and 404'd on the delivery link
// they had just been mailed. Same rule as projectPeople.ts: no rows *here* = sees all.

/**
 * Project ids the session may see on its active client, or null if unrestricted there
 * (no ProjectMember rows on this client — falls back to plain client-scoping).
 */
export async function getAccessibleProjectIds(session: SessionUser): Promise<string[] | null> {
  if (session.isAdmin || !session.clientId) return null;

  const memberships = await db.projectMember.findMany({
    where: { userId: session.id, project: { clientId: session.clientId } },
    select: { projectId: true },
  });
  if (memberships.length === 0) return null;

  // Being put on a film's review cycle is a grant in its own right, and it is the only
  // one the studio issues for a Film project — there is no ProjectMember row to go with
  // it. Without this, a reviewer who is restricted to one delivery cannot see the film
  // they are reviewing anywhere in the portal, and the cut-ready email is their only way
  // in. Revoked reviewers are excluded, so taking somebody off the cycle still hides it.
  const reviewing = await db.reviewer.findMany({
    where: { userId: session.id, revokedAt: null, project: { clientId: session.clientId } },
    select: { projectId: true },
  });

  return [...new Set([...memberships, ...reviewing].map((m) => m.projectId))];
}

/**
 * Single-project gate: same-client ownership, then — for a login restricted on this
 * project's client (one with ProjectMember rows there) — membership in this project.
 * Resolves the effective role to enforce for this project.
 */
export async function getProjectAccess(
  session: SessionUser,
  project: { id: string; clientId: string }
): Promise<ProjectAccess> {
  if (session.isAdmin) return { allowed: true, role: "OWNER" };
  if (session.clientId !== project.clientId) return { allowed: false };

  const memberships = await db.projectMember.findMany({
    where: { userId: session.id, project: { clientId: project.clientId } },
    select: { projectId: true, role: true },
  });
  if (memberships.length === 0) return { allowed: true, role: session.role };

  const membership = memberships.find((m) => m.projectId === project.id);
  if (!membership) return { allowed: false };
  return { allowed: true, role: membership.role };
}

/**
 * A link to a project that belongs to another of this seat's clients — a delivery or
 * release email for client B opened while the session is looking at client A. Switch the
 * session to that client and report it, so the caller can reload the page under it;
 * otherwise the link 404s for someone who is entitled to it. False when the seat is not a
 * member of that client (or is already on it): the normal checks then decide.
 */
export async function switchToProjectClient(
  session: SessionUser,
  project: { clientId: string }
): Promise<boolean> {
  if (session.isAdmin || session.clientId === project.clientId) return false;
  if (!session.memberships.some((m) => m.clientId === project.clientId)) return false;
  return setActiveClient(session.sessionId, session.id, project.clientId);
}
