import { mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
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
      clientId: opts.clientId,
      title: opts.title,
      path: path_,
      inboxSlug,
      status: "DRAFT",
      expiresAt: opts.expiresAt ?? null,
    },
  });

  return { project, inboxPath: inboxDirFor(client.username, inboxSlug) };
}
