import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { addSeat, resetSeatPassword } from "@/lib/clients";
import { isLive } from "@/lib/deliveryNotify";
import { emailLogoUrl } from "@/lib/emailLogo";
import { sendOnboardingEmail } from "@/lib/mailer";
import { getProjectAccess } from "@/lib/projectAccess";
import { notifyCutReady } from "@/lib/reviewMail";

/**
 * A client owner bringing their own people onto one project.
 *
 * Deliberately narrower than the studio's Add login: the only grants are View and View +
 * download, always restricted to this one project (a ProjectMember row), never Owner, so
 * nobody a client adds can add anyone else or see another project. On a Film project the
 * person is also put on the review (a SEAT reviewer): they can watch the cuts and leave
 * notes, and approving stays with owners (reviewAccess.canApprove).
 *
 * The one rule that must never slip: a login with no ProjectMember rows is unrestricted.
 * So removing someone's last project on this client removes their membership of the
 * client too, rather than leaving a row-less login that suddenly sees everything.
 */

export type PersonRole = "VIEWER" | "DOWNLOADER";
type Role = "OWNER" | PersonRole;

export type ProjectPerson = {
  id: string;
  name: string;
  email: string;
  kind: "SEAT" | "GUEST";
  role: Role | null;
  /** True for the client's own unrestricted logins: they see every project. */
  allProjects: boolean;
  /** Never signed in yet. */
  invited: boolean;
  removable: boolean;
};

type Project = { id: string; clientId: string; title: string; type: string };

/** Owners of this client, on this project. Staff manage people from the admin instead. */
export async function canManagePeople(session: SessionUser, project: { id: string; clientId: string }) {
  if (session.isAdmin || session.clientId !== project.clientId) return false;
  const access = await getProjectAccess(session, project);
  return access.allowed && access.role === "OWNER";
}

export async function listProjectPeople(project: Project, viewerId: string): Promise<ProjectPerson[]> {
  const members = await db.clientMember.findMany({
    where: { clientId: project.clientId, user: { deactivatedAt: null, isAdmin: false } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          lastLoginAt: true,
          projectMemberships: { select: { projectId: true, role: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const people: ProjectPerson[] = [];
  for (const m of members) {
    const rows = m.user.projectMemberships;
    const here = rows.find((r) => r.projectId === project.id);
    if (rows.length > 0 && !here) continue;
    const role = (here?.role ?? m.role) as Role;
    people.push({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      kind: "SEAT",
      role,
      allProjects: rows.length === 0,
      invited: m.user.lastLoginAt == null,
      removable: !!here && role !== "OWNER" && m.user.id !== viewerId,
    });
  }

  // Guests the studio put on a film. Shown so the owner knows who else is watching, but
  // theirs to manage only through us: a guest has no login to take away.
  if (project.type === "FILM") {
    const guests = await db.reviewer.findMany({
      where: { projectId: project.id, kind: "GUEST", revokedAt: null },
      orderBy: { createdAt: "asc" },
    });
    for (const g of guests) {
      people.push({
        id: g.id,
        name: g.name || g.email,
        email: g.email,
        kind: "GUEST",
        role: null,
        allProjects: false,
        invited: g.lastOpenedAt == null,
        removable: false,
      });
    }
  }
  return people;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addProjectPerson(
  session: SessionUser,
  project: Project & { client: { name: string; logoUrl: string | null } },
  input: { name: string; email: string; role: string }
): Promise<{ ok: true; name: string; mailed: "welcome" | "cut" | null } | { ok: false; error: string; status: number }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !EMAIL.test(email)) return { ok: false, error: "A name and an email address are needed.", status: 400 };
  if (input.role !== "VIEWER" && input.role !== "DOWNLOADER") {
    return { ok: false, error: "Choose View or View and download.", status: 400 };
  }
  const role = input.role as PersonRole;

  const existing = await db.user.findUnique({
    where: { email },
    include: {
      clientMemberships: { select: { clientId: true } },
      projectMemberships: { select: { projectId: true } },
    },
  });

  let userId: string;
  let fresh = false;
  if (existing) {
    // Anything other than "already one of yours, on other projects" goes through the
    // studio: linking a login that belongs to another client, or bringing back one we
    // switched off, changes more than this one project.
    if (existing.isAdmin) return { ok: false, error: "That address belongs to the studio.", status: 409 };
    const ours = existing.clientMemberships.some((m) => m.clientId === project.clientId);
    // Someone this client removed earlier and nobody else has: a login with no account
    // left anywhere. Bringing them back to this one project is safe.
    const orphan = !existing.deactivatedAt && existing.clientMemberships.length === 0;
    if (orphan) {
      await db.clientMember.create({ data: { userId: existing.id, clientId: project.clientId, role } });
    } else if (existing.deactivatedAt || !ours) {
      return {
        ok: false,
        error: "That person already has a login with us. Email hi@bjur.nyc and we will add them.",
        status: 409,
      };
    }
    if (!orphan && existing.projectMemberships.length === 0) {
      return { ok: false, error: "They already see every project.", status: 409 };
    }
    if (existing.projectMemberships.some((p) => p.projectId === project.id)) {
      return { ok: false, error: "They are already on this project.", status: 409 };
    }
    await db.projectMember.create({ data: { userId: existing.id, projectId: project.id, role } });
    userId = existing.id;
  } else {
    const { user } = await addSeat({
      clientId: project.clientId,
      name,
      email,
      role,
      projectAccess: [{ projectId: project.id, role }],
    });
    userId = user.id;
    fresh = true;
  }

  const person = await db.user.findUniqueOrThrow({ where: { id: userId } });

  let reviewerId: string | null = null;
  if (project.type === "FILM") {
    const reviewer = await db.reviewer.upsert({
      where: { projectId_email: { projectId: project.id, email: person.email } },
      update: { revokedAt: null, userId: person.id, kind: "SEAT" },
      create: { projectId: project.id, kind: "SEAT", userId: person.id, email: person.email, name: person.name },
    });
    reviewerId = reviewer.id;
  }

  // One mail, not two. On a film with a cut already out, the cut-ready mail carries the
  // login for someone who has never signed in (and the review guide follows it), so a
  // welcome first would hand over a password the cut mail then replaces.
  const current =
    reviewerId != null
      ? await db.review.findFirst({
          where: { asset: { projectId: project.id }, sentAt: { not: null } },
          orderBy: { version: "desc" },
          select: { id: true },
        })
      : null;

  let mailed: "welcome" | "cut" | null = null;
  if (current && reviewerId && (isLive() || !fresh)) {
    if ((await notifyCutReady(current.id, {}, [reviewerId])).sent > 0) mailed = "cut";
  }
  if (!mailed && fresh) {
    // addSeat's password went nowhere yet; this is where it is handed over.
    const { tempPassword } = await resetSeatPassword(person.id);
    await sendOnboardingEmail(person.email, {
      clientName: project.client.name,
      logoUrl: emailLogoUrl(project.client.logoUrl),
      recipientName: person.name,
      portalUrl: process.env.PORTAL_URL ?? "https://portal.bjur.nyc",
      signInEmail: person.email,
      tempPassword,
    });
    mailed = "welcome";
  }

  await db.activity.create({
    data: {
      actor: project.client.name,
      action: `${session.name} added ${person.name} (${role === "VIEWER" ? "view" : "view and download"}) to "${project.title}"`,
    },
  });

  return { ok: true, name: person.name, mailed };
}

export async function removeProjectPerson(
  session: SessionUser,
  project: Project & { client: { name: string } },
  userId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (userId === session.id) return { ok: false, error: "You cannot remove yourself.", status: 400 };

  const row = await db.projectMember.findFirst({ where: { userId, projectId: project.id } });
  const member = await db.clientMember.findFirst({ where: { userId, clientId: project.clientId } });
  if (!row || !member) return { ok: false, error: "They are not on this project.", status: 404 };
  if (row.role === "OWNER" || member.role === "OWNER") {
    return { ok: false, error: "Owners are changed by the studio.", status: 403 };
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.projectMember.delete({ where: { id: row.id } });
  await db.reviewer.updateMany({
    where: { projectId: project.id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Their last project on this client: take the membership too, or the login would be
  // left with no ProjectMember rows here, which reads as "sees every project".
  const left = await db.projectMember.count({ where: { userId, project: { clientId: project.clientId } } });
  if (left === 0) {
    await db.clientMember.delete({ where: { id: member.id } });
    // Nothing left to sign in to: end the sessions they have open.
    if ((await db.clientMember.count({ where: { userId } })) === 0) {
      await db.session.deleteMany({ where: { userId } });
    }
  }

  await db.activity.create({
    data: { actor: project.client.name, action: `${session.name} removed ${user.name} from "${project.title}"` },
  });
  return { ok: true };
}
