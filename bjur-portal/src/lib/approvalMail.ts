import { db } from "@/lib/db";
import { sendApprovalEmail, sendStaffAlertEmail } from "@/lib/mailer";
import { signPublishToken, canSignPublishTokens } from "@/lib/publishToken";
import type { StaffAlertEmailProps } from "@/emails/staffAlert";

function portalUrl() {
  return process.env.PORTAL_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

/** Same UTC formatting the calendar and the client panel use, so nothing disagrees. */
function when(d: Date | null) {
  if (!d) return "no publish time set";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

/**
 * Email #4. Goes to the client's OWNER seats — the same people the in-app Approve and
 * Hold buttons are limited to, so the email cannot offer an action the portal would
 * refuse.
 *
 * Never throws: a failed send must not roll back the state change that triggered it. A
 * post sitting in AWAITING with no email is recoverable; one the admin believes is
 * still a draft is not.
 */
export type ApprovalMailDeps = { send: typeof sendApprovalEmail };

export async function sendApprovalRequest(
  assetId: string,
  opts: { isReminder?: boolean; deps?: Partial<ApprovalMailDeps> } = {}
) {
  const send = opts.deps?.send ?? sendApprovalEmail;
  try {
    if (!canSignPublishTokens()) {
      console.warn("[approval-mail] SESSION_SECRET not set — skipping approval email");
      return { sent: 0 };
    }

    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        name: true,
        contentTitle: true,
        caption: true,
        publishAt: true,
        publishIg: true,
        publishYt: true,
        publishState: true,
        approvalDueAt: true,
        project: {
          select: {
            id: true,
            title: true,
            clientId: true,
            client: { select: { name: true } },
          },
        },
      },
    });
    if (!asset || asset.publishState !== "AWAITING") return { sent: 0 };

    const owners = await db.user.findMany({
      where: {
        clientId: asset.project.clientId,
        role: "OWNER",
        isAdmin: false,
        deactivatedAt: null,
      },
      select: { email: true, name: true },
    });
    if (owners.length === 0) {
      console.warn(`[approval-mail] ${asset.project.client.name} has no active owner seat to ask`);
      return { sent: 0 };
    }

    // The links die when the post was due out. After that there is nothing to approve —
    // it either published or it did not — so a live token would only be a loose end.
    const exp = (asset.publishAt ?? asset.approvalDueAt ?? new Date(Date.now() + 86_400_000)).getTime();
    const base = `${portalUrl()}/api/projects/${asset.project.id}/posts/${asset.id}/act`;
    const approveUrl = `${base}?t=${signPublishToken({ assetId: asset.id, action: "approve", exp })}`;
    const holdUrl = `${base}?t=${signPublishToken({ assetId: asset.id, action: "hold", exp })}`;

    const platforms =
      [asset.publishIg && "Instagram", asset.publishYt && "YouTube"].filter(Boolean).join(" + ") ||
      "No platform set";

    let sent = 0;
    for (const owner of owners) {
      await send(owner.email, {
        clientName: asset.project.client.name,
        recipientName: owner.name?.split(/\s+/)[0] ?? "there",
        title: asset.contentTitle || asset.name,
        projectTitle: asset.project.title,
        caption: asset.caption,
        platforms,
        publishAtLabel: when(asset.publishAt),
        autoApproveLabel: asset.approvalDueAt ? when(asset.approvalDueAt) : null,
        approveUrl,
        holdUrl,
        projectUrl: `${portalUrl()}/p/${asset.project.id}`,
        isReminder: Boolean(opts.isReminder),
      });
      sent++;
    }
    return { sent };
  } catch (err) {
    console.error("[approval-mail] failed to send:", err);
    return { sent: 0 };
  }
}

/**
 * Email #8. Goes to every active staff admin. Also never throws — an alert that takes
 * down the thing it was reporting on would be its own outage.
 */
export async function sendStaffAlert(props: Omit<StaffAlertEmailProps, "actionUrl"> & { actionPath: string }) {
  try {
    const admins = await db.user.findMany({
      where: { isAdmin: true, deactivatedAt: null },
      select: { email: true },
    });
    const { actionPath, ...rest } = props;
    for (const admin of admins) {
      await sendStaffAlertEmail(admin.email, { ...rest, actionUrl: `${portalUrl()}${actionPath}` });
    }
    return { sent: admins.length };
  } catch (err) {
    console.error("[staff-alert] failed to send:", err);
    return { sent: 0 };
  }
}
