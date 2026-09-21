import { db } from "@/lib/db";
import { sendExpiryEmail, sendReleasedEmail } from "@/lib/mailer";
import { formatBytes } from "@/lib/format";
import { isLive } from "@/lib/deliveryNotify";

function portalUrl() {
  return process.env.PORTAL_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

function day(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export type ClientMailDeps = {
  sendExpiry: typeof sendExpiryEmail;
  sendReleased: typeof sendReleasedEmail;
};

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
 * The payment-release email: sent once, when staff turn a project's payment hold off.
 *
 * Transactional rather than a notification — it confirms a purchase and tells the client
 * the mark is gone — so it goes out on the flip rather than waiting for a scheduler, and
 * it is not gated on a notify preference, the same way a licence receipt is not.
 *
 * Recipients come from ClientMember, not User.clientId + User.role. The membership table
 * is the authority on who belongs to a client — a seat can hold several, at a different
 * role in each — and on this database the two already disagree: seven owners by
 * membership against five by the legacy column. Reading the old field here would silently
 * skip people who paid.
 *
 * Never throws. A failed send must not roll back the release itself: the client's files
 * are already clean, and refusing to record that because an SMTP call timed out would be
 * the worse failure.
 */
export async function sendPaymentReleaseReceipt(projectId: string, deps: Partial<ClientMailDeps> = {}) {
  const send = deps.sendReleased ?? sendReleasedEmail;
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        clientId: true,
        expiresAt: true,
        client: { select: { name: true } },
        _count: { select: { assets: { where: { internal: false } } } },
      },
    });
    if (!project) return { sent: 0 };

    const owners = await db.clientMember.findMany({
      where: {
        clientId: project.clientId,
        role: "OWNER",
        user: { isAdmin: false, deactivatedAt: null },
      },
      select: { user: { select: { email: true, name: true } } },
    });

    // One seat can own several clients, and nothing stops two memberships resolving to
    // the same address — dedupe so nobody gets thanked twice for one purchase.
    const recipients = owners
      .map((m) => m.user)
      .filter((r, i, all) => all.findIndex((x) => x.email === r.email) === i);

    // Same kill switch as delivery mail. This one thanks a named person for money they
    // may not have paid, so being able to exercise a release end to end without mailing
    // anyone matters more here than anywhere else — turning a hold off is exactly the
    // sort of thing you try once on a real client's project to see what it does.
    if (!isLive() && !deps.sendReleased) {
      await db.activity.create({
        data: {
          actor: "Mailer",
          action:
            `(dry run) would thank ${recipients.length} owner(s) for ${project.title} ` +
            `(${project.client.name}): ${recipients.map((r) => r.email).join(", ")}`,
        },
      });
      return { sent: 0, dryRun: true };
    }

    for (const r of recipients) {
      await send(r.email, {
        recipientName: r.name?.split(/\s+/)[0] ?? "there",
        clientName: project.client.name,
        projectTitle: project.title,
        projectUrl: `${portalUrl()}/p/${project.id}`,
        fileCount: project._count.assets,
        expiresAt: project.expiresAt ? day(project.expiresAt) : null,
      });
    }
    return { sent: recipients.length };
  } catch (err) {
    console.error("[release-mail] failed to send release receipt:", err);
    return { sent: 0 };
  }
}
