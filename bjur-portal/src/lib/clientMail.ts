import { db } from "@/lib/db";
import { sendWeeklyDigestEmail, sendExpiryEmail, sendLicenseEmail } from "@/lib/mailer";
import { signThumbUrl, canSignPublishTokens } from "@/lib/publishToken";
import { formatBytes } from "@/lib/format";

function portalUrl() {
  return process.env.PORTAL_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

function day(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export type ClientMailDeps = {
  sendWeekly: typeof sendWeeklyDigestEmail;
  sendExpiry: typeof sendExpiryEmail;
  sendLicense: typeof sendLicenseEmail;
};

/**
 * Email #3 — the Monday digest, for retainer clients only.
 *
 * A one-off delivery client has nothing recurring to summarise; they got a delivery
 * email when the work landed, and a weekly "here is the same thing again" is how a
 * sender ends up filtered. Sends nothing when the week is empty, for the same reason.
 */
export async function sendWeeklyDigests(weekStart: Date, deps: Partial<ClientMailDeps> = {}) {
  const send = deps.sendWeekly ?? sendWeeklyDigestEmail;
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  const clients = await db.client.findMany({
    where: { status: "ACTIVE", type: "RETAINER", notifyWeekly: true },
    select: { id: true, name: true },
  });

  let sent = 0;
  for (const client of clients) {
    const assets = await db.asset.findMany({
      where: {
        project: { clientId: client.id },
        internal: false,
        OR: [
          { weekOf: { gte: weekStart, lt: weekEnd } },
          { publishAt: { gte: weekStart, lt: weekEnd } },
        ],
      },
      orderBy: [{ publishAt: "asc" }, { weekOf: "asc" }],
      select: {
        id: true,
        name: true,
        contentTitle: true,
        thumbRelPath: true,
        publishAt: true,
        publishIg: true,
        publishYt: true,
        publishState: true,
        project: { select: { title: true } },
      },
    });
    if (assets.length === 0) continue;

    const recipients = await db.user.findMany({
      where: { clientId: client.id, isAdmin: false, deactivatedAt: null, notifyDelivery: true },
      select: { email: true, name: true },
    });
    if (recipients.length === 0) continue;

    const items = assets.map((a) => {
      const platforms = [a.publishIg && "Instagram", a.publishYt && "YouTube"].filter(Boolean).join(" + ");
      return {
        title: a.contentTitle || a.name,
        projectTitle: a.project.title,
        // Unsigned when there is no secret to sign with: a broken image is better than
        // a URL that 401s in every recipient's client.
        thumbUrl:
          a.thumbRelPath && canSignPublishTokens() ? signThumbUrl(portalUrl(), a.id) : null,
        detail: a.publishAt ? `${day(a.publishAt)}${platforms ? ` · ${platforms}` : ""}` : "Delivered",
        state: a.publishState === "NONE" ? null : a.publishState.charAt(0) + a.publishState.slice(1).toLowerCase(),
      };
    });

    for (const r of recipients) {
      await send(r.email, {
        clientName: client.name,
        recipientName: r.name?.split(/\s+/)[0] ?? "there",
        weekLabel: day(weekStart),
        items,
        portalUrl: portalUrl(),
      });
      sent++;
    }
  }
  return { sent };
}

/**
 * Email #5 — expiry reminders at 14 and 3 days.
 *
 * The threshold that fired is recorded on the project, so each one goes out once, and it
 * resets when expiresAt moves: extending a gallery re-arms both reminders rather than
 * leaving a client who was warned once and never again.
 */
export async function sendExpiryReminders(now = new Date(), deps: Partial<ClientMailDeps> = {}) {
  const send = deps.sendExpiry ?? sendExpiryEmail;

  const projects = await db.project.findMany({
    where: {
      expiresAt: { not: null, gt: now, lte: new Date(now.getTime() + 14 * 86_400_000) },
      client: { status: "ACTIVE" },
    },
    select: {
      id: true,
      title: true,
      expiresAt: true,
      expiryReminderSentFor: true,
      clientId: true,
      client: { select: { name: true } },
      assets: { where: { internal: false }, select: { sizeBytes: true } },
    },
  });

  let sent = 0;
  for (const project of projects) {
    const daysLeft = Math.ceil((project.expiresAt!.getTime() - now.getTime()) / 86_400_000);
    const threshold = daysLeft <= 3 ? 3 : 14;

    // Already sent this one, or a nearer one. 3 is "nearer" than 14, so a project that
    // got the fortnight warning still gets the three-day one.
    if (project.expiryReminderSentFor !== null && project.expiryReminderSentFor <= threshold) continue;

    const recipients = await db.user.findMany({
      where: { clientId: project.clientId, isAdmin: false, deactivatedAt: null, notifyExpiry: true },
      select: { email: true, name: true },
    });

    // Marked regardless of whether anyone is listening, so a project with no opted-in
    // seats is not re-examined every single tick.
    await db.project.update({ where: { id: project.id }, data: { expiryReminderSentFor: threshold } });
    if (recipients.length === 0) continue;

    const totalBytes = project.assets.reduce((n, a) => n + Number(a.sizeBytes), 0);
    for (const r of recipients) {
      await send(r.email, {
        recipientName: r.name?.split(/\s+/)[0] ?? "there",
        projectTitle: project.title,
        clientName: project.client.name,
        expiresAtLabel: day(project.expiresAt!),
        daysLeft,
        assetCount: project.assets.length,
        totalSize: formatBytes(totalBytes),
        projectUrl: `${portalUrl()}/p/${project.id}`,
      });
      sent++;
    }
  }
  return { sent };
}

/**
 * Email #6 — the license receipt. To the person it was issued to, plus the client's
 * owners, who need the record even when someone else on the account did the buying.
 *
 * Never throws: a failed receipt must not roll back a license the client has already
 * paid for.
 */
export async function sendLicenseReceipt(licenseId: string, deps: Partial<ClientMailDeps> = {}) {
  const send = deps.sendLicense ?? sendLicenseEmail;
  try {
    const license = await db.license.findUnique({
      where: { id: licenseId },
      select: {
        tier: true,
        amount: true,
        scope: true,
        purchasedAt: true,
        expiresAt: true,
        asset: { select: { id: true, name: true, projectId: true } },
        client: { select: { id: true, name: true } },
        user: { select: { email: true, name: true, isAdmin: true } },
      },
    });
    if (!license) return { sent: 0 };

    const owners = await db.user.findMany({
      where: { clientId: license.client.id, role: "OWNER", isAdmin: false, deactivatedAt: null },
      select: { email: true, name: true },
    });

    // The purchaser is an admin when staff granted the license, and mailing a receipt to
    // ourselves is noise — the owners are the ones who need the record either way.
    const granted = license.user.isAdmin;
    const recipients = [...(granted ? [] : [license.user]), ...owners].filter(
      (r, i, all) => all.findIndex((x) => x.email === r.email) === i
    );

    for (const r of recipients) {
      await send(r.email, {
        recipientName: r.name?.split(/\s+/)[0] ?? "there",
        clientName: license.client.name,
        assetName: license.asset.name,
        tier: license.tier.charAt(0) + license.tier.slice(1).toLowerCase(),
        amount: license.amount,
        scope: license.scope,
        purchasedAtLabel: day(license.purchasedAt),
        expiresAtLabel: license.expiresAt ? day(license.expiresAt) : null,
        granted,
        assetUrl: `${portalUrl()}/p/${license.asset.projectId}`,
      });
    }
    return { sent: recipients.length };
  } catch (err) {
    console.error("[license-mail] failed to send receipt:", err);
    return { sent: 0 };
  }
}
