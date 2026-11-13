import { db } from "@/lib/db";
import { canOpenProjectLink } from "@/lib/projectAccess";
import { sendStaffAlert } from "@/lib/staffAlert";

// The check that runs before any client email with a project link goes out.
//
// Every one of those emails used to pick its recipients by one rule and the page the link
// opens used another, and on 2026-11-13 they disagreed: a release receipt thanked an owner
// for files on a page that 404'd for him. Now each send asks canOpenProjectLink(), the
// same gate the page uses, for every recipient.
//
// Two kinds of "can't open":
// - Expected: a seat the studio limited to other projects on this client. Not on this
//   project, so not told about it. Dropped quietly.
// - Not expected: anyone the email is *specifically* for — an owner on a release receipt,
//   a reviewer on a cut — who would land on a 404. Held back, and the studio is emailed to
//   fix access, so it's caught before the client ever sees a dead link.

export type LinkRecipient = { id: string; email: string; name: string | null };

export type GuardDeps = { alert: typeof sendStaffAlert };

export type GuardResult<T> = { reachable: T[]; heldBack: T[] };

/**
 * Splits recipients into those whose link would open and those it would not. `expected`
 * says whether this email's recipients are all supposed to get in (release receipts,
 * cut-ready): if so, anyone held back is reported to the studio.
 */
export async function guardProjectEmail<T extends LinkRecipient>(
  opts: {
    project: { id: string; clientId: string; status: string; title: string; clientName: string };
    recipients: T[];
    /** What the email is, for the alert: "release receipt", "new files", "cut ready". */
    email: string;
    /**
     * Who is meant to be able to open the link: true = everyone (release receipts,
     * cut-ready), false = nobody in particular, or a test per recipient (new-file mail:
     * the client's owners).
     */
    expected: boolean | ((r: T) => boolean);
    /** Override the access check (the cut-ready mail checks the review page instead). */
    canOpen?: (r: T) => Promise<boolean>;
  },
  deps: Partial<GuardDeps> = {}
): Promise<GuardResult<T>> {
  const canOpen = opts.canOpen ?? ((r: T) => canOpenProjectLink(r.id, opts.project));
  const reachable: T[] = [];
  const heldBack: T[] = [];
  for (const r of opts.recipients) (await canOpen(r) ? reachable : heldBack).push(r);

  const expected = opts.expected;
  const surprising = heldBack.filter((r) => (typeof expected === "function" ? expected(r) : expected));
  if (surprising.length > 0) {
    const who = surprising.map((r) => r.name || r.email).join(", ");
    await db.activity.create({
      data: {
        actor: "Mailer",
        action:
          `held back the ${opts.email} email for ${opts.project.title} (${opts.project.clientName}) ` +
          `from ${who}: the link would not open for them`,
      },
    });
    const alert = deps.alert ?? sendStaffAlert;
    await alert({
      kind: "link-blocked",
      headline: `${who} can't open ${opts.project.title}, so their ${opts.email} email wasn't sent.`,
      facts: [
        { label: "Client", value: opts.project.clientName },
        { label: "Project", value: opts.project.title },
        { label: "Held back", value: surprising.map((r) => r.email).join(", ") },
        ...(reachable.length ? [{ label: "Sent to", value: reachable.map((r) => r.email).join(", ") }] : []),
      ],
      detail:
        "Check their access on the client page (Manage access), or the project's status. " +
        "Then send them the link yourself; this email will not retry.",
      actionPath: `/admin/clients/${opts.project.clientId}`,
      actionLabel: "Open client",
    });
  }
  return { reachable, heldBack };
}
