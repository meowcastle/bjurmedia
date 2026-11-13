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
//
// The rule itself lives in decideAccess(), with no database in it. The page gate, the
// pre-send check on every client email and the nightly audit all reach it, so the link a
// client is mailed and the page that link opens cannot disagree about who gets in.

/**
 * The access rule. `memberRole` is the seat's role on the project's client (null = not a
 * member); `limits` are its ProjectMember rows on that same client only.
 */
export function decideAccess(input: {
  isAdmin: boolean;
  memberRole: Role | null;
  limits: { projectId: string; role: Role }[];
  projectId: string;
}): ProjectAccess {
  if (input.isAdmin) return { allowed: true, role: "OWNER" };
  if (!input.memberRole) return { allowed: false };
  if (input.limits.length === 0) return { allowed: true, role: input.memberRole };
  const row = input.limits.find((l) => l.projectId === input.projectId);
  return row ? { allowed: true, role: row.role } : { allowed: false };
}

/** This seat's ProjectMember rows on one client. */
function limitsOn(userId: string, clientId: string) {
  return db.projectMember.findMany({
    where: { userId, project: { clientId } },
    select: { projectId: true, role: true },
  }) as Promise<{ projectId: string; role: Role }[]>;
}

/**
 * Project ids the session may see on its active client, or null if unrestricted there
 * (no ProjectMember rows on this client — falls back to plain client-scoping).
 */
export async function getAccessibleProjectIds(session: SessionUser): Promise<string[] | null> {
  if (session.isAdmin || !session.clientId) return null;

  const memberships = await limitsOn(session.id, session.clientId);
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
 * Single-project gate for a signed-in session: the project must be on the client the
 * session is looking at, then decideAccess() for that client.
 */
export async function getProjectAccess(
  session: SessionUser,
  project: { id: string; clientId: string }
): Promise<ProjectAccess> {
  if (session.isAdmin) return { allowed: true, role: "OWNER" };
  if (session.clientId !== project.clientId) return { allowed: false };
  return decideAccess({
    isAdmin: false,
    memberRole: session.role,
    limits: await limitsOn(session.id, project.clientId),
    projectId: project.id,
  });
}

/**
 * The same gate for a seat with no session — "if this person clicked the link, would they
 * get in?" Used before mail goes out and by the nightly audit. Mirrors sign-in: a
 * switched-off login, or a membership on a client that is not ACTIVE, gets nothing. The
 * client the session happens to be on does not matter, because /p/[id] switches to the
 * project's client for any seat that belongs to it (switchToProjectClient).
 */
export async function seatProjectAccess(
  userId: string,
  project: { id: string; clientId: string }
): Promise<ProjectAccess> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      isAdmin: true,
      deactivatedAt: true,
      clientMemberships: {
        where: { clientId: project.clientId, client: { status: "ACTIVE" } },
        select: { role: true },
      },
    },
  });
  if (!user || user.deactivatedAt) return { allowed: false };
  return decideAccess({
    isAdmin: user.isAdmin,
    memberRole: (user.clientMemberships[0]?.role as Role | undefined) ?? null,
    limits: user.isAdmin ? [] : await limitsOn(userId, project.clientId),
    projectId: project.id,
  });
}

/** Would this seat's /p/[id] link open? Access, and the project being LIVE. */
export async function canOpenProjectLink(
  userId: string,
  project: { id: string; clientId: string; status: string }
): Promise<boolean> {
  if (project.status !== "LIVE") return false;
  return (await seatProjectAccess(userId, project)).allowed;
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

/**
 * Manage access: replaces a seat's project limits on one client. An empty list = sees every
 * project there. Only this client's rows are touched — clearing every row the seat held
 * wiped its limits on its other clients, quietly widening it to every project there.
 * The caller checks the projects belong to this client.
 */
export async function replaceClientLimits(
  userId: string,
  clientId: string,
  limits: { projectId: string; role: Role }[]
) {
  await db.$transaction([
    db.projectMember.deleteMany({ where: { userId, project: { clientId } } }),
    ...(limits.length > 0
      ? [db.projectMember.createMany({ data: limits.map((l) => ({ userId, projectId: l.projectId, role: l.role })) })]
      : []),
  ]);
}
