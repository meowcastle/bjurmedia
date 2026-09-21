import { db } from "@/lib/db";
import { sendStaffAlertEmail } from "@/lib/mailer";
import type { StaffAlertEmailProps } from "@/emails/staffAlert";

function portalUrl() {
  return process.env.PORTAL_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

/**
 * Email #8 — tells every active staff admin that something needs a person.
 *
 * Lived in approvalMail.ts, which held two unrelated things: the auto-approve request
 * mail (gone with auto-approve) and this. Publish failures still need to reach someone —
 * they fire at scheduled publish times, routinely evenings and weekends — so it moved
 * here rather than going out with the file around it.
 *
 * Never throws: an alert that took down the thing it was reporting on would be its own
 * outage.
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
