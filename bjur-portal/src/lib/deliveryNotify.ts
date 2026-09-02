import { db } from "@/lib/db";
import { sendDeliveryEmail } from "@/lib/mailer";

/**
 * How long a project must go without a new asset before its delivery email fires.
 * Assets land one file at a time (ingest.ts runs per file, and a folder drop over SMB
 * trickles in over minutes), so without this a single delivery would mail the client
 * once per clip.
 */
export const DELIVERY_QUIET_MS = 15 * 60 * 1000;

/**
 * Delivery mail is off unless DELIVERY_EMAILS=live. Anything else — unset included —
 * runs the full pipeline (batching, recipient resolution, subject/body) but writes the
 * result to the Activity feed instead of sending, so a real delivery cycle can be
 * watched end to end before a single client email goes out.
 */
function isLive() {
  return process.env.DELIVERY_EMAILS === "live";
}

/**
 * Called wherever an asset lands for a client. Opens a delivery batch if one isn't
 * already open, and pushes the quiet-period clock forward either way.
 */
export async function markDeliveryPending(projectId: string) {
  const now = new Date();
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { deliveryPendingSince: true },
  });
  if (!project) return;

  await db.project.update({
    where: { id: projectId },
    data: {
      deliveryPendingAt: now,
      ...(project.deliveryPendingSince ? {} : { deliveryPendingSince: now }),
    },
  });
}

/**
 * Who on this client should hear about this specific project. A login with no
 * ProjectMember rows is unrestricted and sees everything; a restricted one must hold
 * membership in this exact project. Getting this wrong would tell a project-scoped
 * client contact about work they can't open — so it mirrors getAccessibleProjectIds()
 * rather than re-deriving the rule.
 */
async function recipientsFor(project: { id: string; clientId: string }) {
  const users = await db.user.findMany({
    where: {
      clientId: project.clientId,
      deactivatedAt: null,
      notifyDelivery: true,
    },
    include: { projectMemberships: { select: { projectId: true } } },
  });

  return users.filter(
    (u) =>
      u.projectMemberships.length === 0 ||
      u.projectMemberships.some((m) => m.projectId === project.id)
  );
}

function fmtDate(d: Date | null) {
  if (!d) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function sendForProject(project: {
  id: string;
  clientId: string;
  title: string;
  expiresAt: Date | null;
  deliveryPendingSince: Date | null;
  deliveryPendingAt: Date | null;
  client: { name: string };
}) {
  const since = project.deliveryPendingSince ?? project.deliveryPendingAt!;

  // Both halves of "assets updated": genuinely new files, and existing ones re-ingested
  // in place (ingest.ts replaces at the same relPath rather than duplicating).
  const assets = await db.asset.findMany({
    where: {
      projectId: project.id,
      internal: false,
      OR: [{ createdAt: { gte: since } }, { lastReplacedAt: { gte: since } }],
    },
    select: { format: true, licensable: true, createdAt: true },
  });

  const clearPending = () =>
    db.project.update({
      where: { id: project.id },
      data: { deliveryPendingSince: null, deliveryPendingAt: null },
    });

  if (assets.length === 0) {
    // Everything in the batch was internal-only, or was deleted again before the quiet
    // period elapsed. Nothing to announce.
    await clearPending();
    return;
  }

  const counts = {
    reels: assets.filter((a) => a.format === "Reel").length,
    films: assets.filter((a) => a.format === "Film").length,
    stills: assets.filter((a) => a.format === "Still").length,
    braw: assets.filter((a) => a.licensable).length,
  };
  const isUpdate = assets.every((a) => a.createdAt < since);

  const recipients = await recipientsFor(project);
  const portalUrl = process.env.PORTAL_URL ?? "https://portal.bjur.media";
  const projectUrl = `${portalUrl.replace(/\/$/, "")}/p/${project.id}`;

  if (recipients.length === 0) {
    await db.activity.create({
      data: {
        actor: "Mailer",
        action: `delivery ready for ${project.title} (${project.client.name}) — no seat has delivery notifications on, nothing sent`,
      },
    });
    await clearPending();
    return;
  }

  if (!isLive()) {
    await db.activity.create({
      data: {
        actor: "Mailer",
        action:
          `(dry run) would email ${recipients.length} recipient(s) about ${project.title} ` +
          `(${project.client.name}): ${recipients.map((r) => r.email).join(", ")} — ` +
          `${counts.reels} reels, ${counts.films} films, ${counts.stills} stills, ${counts.braw} BRAW`,
      },
    });
    await db.project.update({
      where: { id: project.id },
      data: { deliveryPendingSince: null, deliveryPendingAt: null },
    });
    return;
  }

  let sent = 0;
  for (const r of recipients) {
    try {
      await sendDeliveryEmail(r.email, {
        clientName: project.client.name,
        recipientName: r.name,
        projectTitle: project.title,
        projectUrl,
        counts,
        isUpdate,
        expiresAt: fmtDate(project.expiresAt),
      });
      sent++;
    } catch (err) {
      // One bad address must not strand the batch — the rest still go, and the failure
      // is visible in the feed rather than only in worker stdout.
      await db.activity.create({
        data: {
          actor: "Mailer",
          action: `failed to email ${r.email} about ${project.title}: ${(err as Error).message}`,
        },
      });
    }
  }

  await db.activity.create({
    data: {
      actor: "Mailer",
      action: `emailed ${sent} client contact(s) about ${project.title} (${project.client.name})`,
    },
  });

  await db.project.update({
    where: { id: project.id },
    data: {
      deliveryPendingSince: null,
      deliveryPendingAt: null,
      deliveryNotifiedAt: new Date(),
    },
  });
}

/**
 * Worker tick: mail every project whose delivery batch has gone quiet. Non-fatal by
 * design, same as postSlackEvent — a mail failure never disturbs ingest.
 */
export async function flushPendingDeliveries() {
  const cutoff = new Date(Date.now() - DELIVERY_QUIET_MS);

  const due = await db.project.findMany({
    where: {
      status: "LIVE",
      deliveryPendingAt: { not: null, lte: cutoff },
    },
    include: { client: { select: { name: true } } },
  });

  for (const project of due) {
    try {
      await sendForProject(project);
    } catch (err) {
      console.error(`[delivery] failed for project ${project.id}:`, err);
    }
  }

  return due.length;
}
