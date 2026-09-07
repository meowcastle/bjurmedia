import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { genTempPassword } from "@/lib/users";

export function slugifyUsername(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

/**
 * Creates a Client org plus its first Owner-seat User, with a freshly generated
 * temp password the admin relays to the client (see onboarding email, src/emails).
 */
export async function createClient(opts: {
  name: string;
  username: string;
  type: "RETAINER" | "ONEOFF";
  ownerName: string;
  ownerEmail: string;
}) {
  const tempPassword = genTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const email = opts.ownerEmail.toLowerCase();

  // An owner who already has a login is linked, not rejected. Creating a client for
  // someone you already work with is the normal case for an agency, and it used to be
  // the one thing the New client dialog refused to do.
  const existing = await db.user.findUnique({ where: { email } });

  const client = await db.client.create({
    data: {
      name: opts.name,
      username: opts.username,
      type: opts.type,
      ...(existing
        ? { members: { create: { userId: existing.id, role: "OWNER" as const } } }
        : {
            users: {
              create: {
                name: opts.ownerName,
                email,
                passwordHash,
                role: "OWNER",
                mustChangePassword: true,
              },
            },
          }),
    },
    include: { users: true, members: true },
  });

  // A brand-new owner needs the membership that governs access; the nested create above
  // cannot reference the client id it is in the middle of creating.
  if (!existing) {
    const owner = client.users[0];
    await db.clientMember.create({
      data: { userId: owner.id, clientId: client.id, role: "OWNER" },
    });
  }

  // No password for someone who already signs in — and nothing to email them either.
  return { client, tempPassword: existing ? null : tempPassword, linkedExisting: !!existing };
}

/**
 * Adds an additional seat to an existing client (Owner/Downloader/Viewer).
 * Passing `projectAccess` restricts the seat to those specific projects, each
 * at its own role — omitting it (or an empty array) leaves the seat
 * unrestricted, seeing every one of the client's projects at `role`.
 */
export async function addSeat(opts: {
  clientId: string;
  name: string;
  email: string;
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
  projectAccess?: { projectId: string; role: "OWNER" | "DOWNLOADER" | "VIEWER" }[];
}) {
  const tempPassword = genTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await db.user.create({
    data: {
      clientId: opts.clientId,
      name: opts.name,
      email: opts.email.toLowerCase(),
      passwordHash,
      role: opts.role,
      mustChangePassword: true,
      // The membership is what grants access now; clientId is kept only as the seat's
      // originating client.
      clientMemberships: { create: { clientId: opts.clientId, role: opts.role } },
      ...(opts.projectAccess?.length
        ? {
            projectMemberships: {
              create: opts.projectAccess.map((p) => ({ projectId: p.projectId, role: p.role })),
            },
          }
        : {}),
    },
  });

  return { user, tempPassword };
}

/**
 * Gives an existing login access to another client.
 *
 * No password is issued and no onboarding mail is sent: this person already signs in,
 * they are simply gaining a second account to look at. Idempotent, so re-adding someone
 * updates their role rather than failing.
 */
export async function addExistingUserToClient(opts: {
  userId: string;
  clientId: string;
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
  projectAccess?: { projectId: string; role: "OWNER" | "DOWNLOADER" | "VIEWER" }[];
}) {
  await db.clientMember.upsert({
    where: { userId_clientId: { userId: opts.userId, clientId: opts.clientId } },
    create: { userId: opts.userId, clientId: opts.clientId, role: opts.role },
    update: { role: opts.role },
  });

  if (opts.projectAccess?.length) {
    // Scoped to this client's projects only — a seat's restrictions on one account must
    // not be wiped by being added to another.
    const ids = opts.projectAccess.map((p) => p.projectId);
    await db.projectMember.deleteMany({ where: { userId: opts.userId, projectId: { in: ids } } });
    await db.projectMember.createMany({
      data: opts.projectAccess.map((p) => ({ userId: opts.userId, projectId: p.projectId, role: p.role })),
    });
  }

  return db.user.findUniqueOrThrow({ where: { id: opts.userId } });
}

/**
 * Regenerates a client user's temp password — for a lost/never-delivered onboarding
 * password, or any time staff need to hand out a fresh one. Forces a change on next
 * login, same as a brand-new seat.
 */
export async function resetSeatPassword(userId: string) {
  const tempPassword = genTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await db.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });

  return { user, tempPassword };
}

/**
 * Brings a revoked seat back for the same client, with a fresh temp password and a
 * clean role/project-access set — what "add seat" does when the email it's given
 * belongs to someone staff previously removed. Their old licenses and uploads are
 * still attached, so the history reconnects to the reinstated login.
 */
export async function reactivateSeat(opts: {
  userId: string;
  clientId: string;
  name: string;
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
  projectAccess?: { projectId: string; role: "OWNER" | "DOWNLOADER" | "VIEWER" }[];
}) {
  const tempPassword = genTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const [, user] = await db.$transaction([
    db.projectMember.deleteMany({ where: { userId: opts.userId } }),
    db.user.update({
      where: { id: opts.userId },
      data: {
        name: opts.name,
        passwordHash,
        role: opts.role,
        deactivatedAt: null,
        mustChangePassword: true,
        ...(opts.projectAccess?.length
          ? {
              projectMemberships: {
                create: opts.projectAccess.map((p) => ({ projectId: p.projectId, role: p.role })),
              },
            }
          : {}),
      },
    }),
    // Last on purpose. The destructure above is positional, and the projectMember
    // delete has to run before user.update recreates them — so this is the only slot
    // that is safe to add to.
    db.clientMember.upsert({
      where: { userId_clientId: { userId: opts.userId, clientId: opts.clientId } },
      create: { userId: opts.userId, clientId: opts.clientId, role: opts.role },
      update: { role: opts.role },
    }),
  ]);

  return { user, tempPassword };
}
