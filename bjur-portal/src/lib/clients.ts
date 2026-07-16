import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export function slugifyUsername(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

function genTempPassword() {
  return randomBytes(9).toString("base64url"); // ~12 chars, url-safe
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

  const client = await db.client.create({
    data: {
      name: opts.name,
      username: opts.username,
      type: opts.type,
      users: {
        create: {
          name: opts.ownerName,
          email: opts.ownerEmail.toLowerCase(),
          passwordHash,
          role: "OWNER",
          mustChangePassword: true,
        },
      },
    },
    include: { users: true },
  });

  return { client, tempPassword };
}

/** Adds an additional seat to an existing client (Owner/Downloader/Viewer). */
export async function addSeat(opts: {
  clientId: string;
  name: string;
  email: string;
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
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
    },
  });

  return { user, tempPassword };
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
