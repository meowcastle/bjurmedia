import { mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { newGuestToken } from "@/lib/reviews";
import { INBOX_ROOT } from "@/lib/media";

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Short, collision-resistant suffix so two projects with the same title don't clash. */
function shortSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

/** Absolute inbox directory an editor should point HandBrake/export tools at. */
export function inboxDirFor(clientUsername: string, inboxSlug: string) {
  return path.join(INBOX_ROOT, clientUsername, inboxSlug);
}

export async function ensureInboxDir(clientUsername: string, inboxSlug: string) {
  await mkdir(inboxDirFor(clientUsername, inboxSlug), { recursive: true });
}

/**
 * Creates a Project row plus its canonical MEDIA_ROOT path and a dedicated inbox
 * folder under INBOX_ROOT/<client.username>/<inboxSlug> — the export destination
 * editors point HandBrake / their image editor at for this project's finals.
 *
 * New projects start as DRAFT (invisible to the client) with no deliveredAt — the
 * ingest pipeline flips status to LIVE and stamps deliveredAt the moment the first
 * asset lands, so "Delivered <date>" always reflects when content actually arrived.
 */
export async function createProject(opts: {
  clientId: string;
  title: string;
  expiresAt?: Date | null;
  /** Fixed at creation. FILM carries the cut-and-notes loop that `review` used to. */
  type?: "DELIVERY" | "CALENDAR" | "FILM";
  /** FILM only: people with no seat who still review. They get a link, not an account. */
  guests?: { email: string; name?: string; role?: string }[];
}) {
  const client = await db.client.findUniqueOrThrow({ where: { id: opts.clientId } });
  const slug = slugify(opts.title);
  const inboxSlug = `${slug}-${shortSuffix()}`;
  const path_ = `${client.name.replace(/[^a-zA-Z0-9]+/g, "")}/${slug}`;

  // Create the inbox folder before the DB row: if this throws (e.g. a read-only
  // mount), we want zero trace of the project rather than an orphaned DRAFT row
  // that the UI reported as a failure but the database actually kept.
  await ensureInboxDir(client.username, inboxSlug);

  const project = await db.project.create({
    data: {
      type: opts.type ?? "DELIVERY",
      clientId: opts.clientId,
      title: opts.title,
      path: path_,
      inboxSlug,
      status: "DRAFT",
      expiresAt: opts.expiresAt ?? null,
    },
  });

  // A Film project with no reviewers is a review screen nobody can open, so the seats are
  // mirrored at creation rather than lazily on first cut. Every role, not only owners: a
  // producer who cannot download still has notes worth hearing. Only owners may approve,
  // and that is checked against ClientMember at the time, not stored here.
  if (project.type === "FILM") {
    await seatReviewers(project.id, opts.clientId);

    for (const guest of opts.guests ?? []) {
      const email = guest.email.trim().toLowerCase();
      if (!email.includes("@")) continue;
      await db.reviewer.upsert({
        where: { projectId_email: { projectId: project.id, email } },
        update: { revokedAt: null },
        create: {
          projectId: project.id,
          kind: "GUEST",
          email,
          // Blank until their first visit, where they are asked once. Showing the address
          // in the meantime would put a stranger's email in front of the whole client.
          name: guest.name?.trim() || "",
          role: guest.role?.trim() || null,
          token: newGuestToken(),
        },
      });
    }
  }

  return { project, inboxPath: inboxDirFor(client.username, inboxSlug) };
}

/**
 * Mirror a client's active seats onto a Film project as SEAT reviewers.
 *
 * Idempotent, so it doubles as the sync called when a seat is added to the client: an
 * upsert on (projectId, email) either creates the row or un-revokes one that was there
 * before, which is what makes re-adding somebody restore their old notes rather than
 * orphan them.
 */
export async function seatReviewers(projectId: string, clientId: string) {
  const members = await db.clientMember.findMany({
    where: { clientId, user: { deactivatedAt: null } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  for (const m of members) {
    await db.reviewer.upsert({
      where: { projectId_email: { projectId, email: m.user.email } },
      update: { revokedAt: null, userId: m.user.id },
      create: {
        projectId,
        kind: "SEAT",
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
      },
    });
  }
}
