import { db } from "@/lib/db";
import { emailLogoUrl } from "@/lib/emailLogo";
import { sendDeliveryEmail, sendOnboardingEmail } from "@/lib/mailer";
import { resetSeatPassword } from "@/lib/clients";
import { isRawCamera } from "@/lib/fileOnly";

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
export function isLive() {
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
  // Membership, not User.clientId: that column is the login's first client and nothing
  // keeps it current, so anyone added to a client later (or belonging to two) was
  // never mailed. ClientMember is what sign-in and project access go by.
  const users = await db.user.findMany({
    where: {
      clientMemberships: { some: { clientId: project.clientId } },
      deactivatedAt: null,
      notifyDelivery: true,
    },
    // Only this client's rows: a restriction on another client says nothing about this one.
    include: {
      projectMemberships: {
        where: { project: { clientId: project.clientId } },
        select: { projectId: true },
      },
    },
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
  paymentHold: boolean;
  deliveryPendingSince: Date | null;
  deliveryPendingAt: Date | null;
  client: { name: string; logoUrl: string | null };
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
    select: { kind: true, name: true, format: true, createdAt: true },
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

  // The old BRAW line counted masters offered for licence, and went when masters went
  // internal. Raw clips are back only for RAW projects, where they *are* the delivery and
  // ingest leaves them client-visible — internal ones are already filtered out above, so
  // a Delivery project's in-house masters still never reach this count.
  const counts = {
    reels: assets.filter((a) => a.format === "Reel").length,
    films: assets.filter((a) => a.format === "Film").length,
    stills: assets.filter((a) => a.format === "Still").length,
    raw: assets.filter((a) => isRawCamera(a.name)).length,
    audio: assets.filter((a) => a.kind === "AUDIO").length,
  };
  // Raw clips and audio are locked, not watermarked, while the hold is on
  // (paymentHold.ts, lockedUnderHold). The mail says so, or the first thing the client
  // does with it is tap a file that will not download and write in to ask why.
  const held = project.paymentHold;
  const isUpdate = assets.every((a) => a.createdAt < since);

  const recipients = await recipientsFor(project);
  const portalUrl = process.env.PORTAL_URL ?? "https://portal.bjur.nyc";
  const projectUrl = `${portalUrl.replace(/\/$/, "")}/p/${project.id}`;

  if (recipients.length === 0) {
    await db.activity.create({
      data: {
        actor: "Mailer",
        action: `new files in ${project.title} (${project.client.name}) — no login has new-file emails on, nothing sent`,
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
          `${counts.reels} reels, ${counts.films} films, ${counts.stills} stills, ` +
          `${counts.raw} raw clips, ${counts.audio} audio files${held ? " (on hold)" : ""}`,
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
      // Never signed in: the project link would land on a sign-in form they have no
      // password for, so they get the welcome with this delivery inside it and a fresh
      // temporary password (the old one is hashed and cannot be re-sent). Only here, in
      // the live branch, so a dry run never resets anyone's password.
      if (r.lastLoginAt == null && !r.isAdmin) {
        const { tempPassword } = await resetSeatPassword(r.id);
        await sendOnboardingEmail(r.email, {
          clientName: project.client.name,
          logoUrl: emailLogoUrl(project.client.logoUrl),
          recipientName: r.name,
          portalUrl,
          signInEmail: r.email,
          tempPassword,
          delivery: {
            projectTitle: project.title,
            reels: counts.reels,
            films: counts.films,
            stills: counts.stills,
            raw: counts.raw,
            audio: counts.audio,
            held,
            expiresAt: fmtDate(project.expiresAt),
          },
        });
        await db.activity.create({
          data: { actor: "Mailer", action: `issued first-login password to ${r.email} with ${project.title}` },
        });
        sent++;
        continue;
      }
      await sendDeliveryEmail(r.email, {
        clientName: project.client.name,
        logoUrl: emailLogoUrl(project.client.logoUrl),
        recipientName: r.name,
        projectTitle: project.title,
        projectUrl,
        counts,
        held,
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
    include: { client: { select: { name: true, logoUrl: true } } },
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
