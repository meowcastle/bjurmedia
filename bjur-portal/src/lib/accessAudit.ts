import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { seatProjectAccess } from "@/lib/projectAccess";
import { sendStaffAlert } from "@/lib/staffAlert";

// The nightly access check. The pre-send check (linkGuard.ts) catches a dead link at the
// moment an email would carry it; this catches the same states while nothing is being
// sent, so they get fixed before the next delivery rather than during it:
//
// - an owner who can't open one of their own client's live projects (owners are limited
//   only by mistake — an access save that went wrong, a limit set on the wrong client)
// - a live project with files that nobody on the client can open
// - a reviewer login that isn't on its film's client, so the review link 404s
//
// It asks seatProjectAccess(), the page's own gate, so it reports what clients would
// actually see. Read-only: it never changes access, it says where to look.

export type AccessIssue = { clientId: string; clientName: string; line: string };

export async function findAccessIssues(): Promise<AccessIssue[]> {
  const issues: AccessIssue[] = [];
  const clients = await db.client.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      projects: {
        where: { status: "LIVE" },
        select: {
          id: true,
          title: true,
          clientId: true,
          _count: { select: { assets: { where: { internal: false } } } },
        },
      },
      members: {
        where: { user: { deactivatedAt: null, isAdmin: false } },
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  for (const client of clients) {
    const note = (line: string) => issues.push({ clientId: client.id, clientName: client.name, line });
    for (const project of client.projects) {
      let anyone = false;
      for (const m of client.members) {
        const ok = (await seatProjectAccess(m.user.id, project)).allowed;
        anyone ||= ok;
        if (!ok && m.role === "OWNER") {
          note(`${m.user.name || m.user.email} is an owner but can't open ${project.title}`);
        }
      }
      if (!anyone && project._count.assets > 0 && client.members.length > 0) {
        note(`nobody on ${client.name} can open ${project.title} (${project._count.assets} files)`);
      }
    }
  }

  const reviewers = await db.reviewer.findMany({
    where: { kind: "SEAT", revokedAt: null, project: { client: { status: "ACTIVE" } } },
    select: {
      name: true,
      email: true,
      userId: true,
      project: { select: { title: true, clientId: true, client: { select: { name: true } } } },
    },
  });
  for (const r of reviewers) {
    const member =
      r.userId &&
      (await db.clientMember.findFirst({
        where: { userId: r.userId, clientId: r.project.clientId, user: { deactivatedAt: null } },
        select: { id: true },
      }));
    if (!member) {
      issues.push({
        clientId: r.project.clientId,
        clientName: r.project.client.name,
        line: `${r.name || r.email} reviews ${r.project.title} but has no working login on ${r.project.client.name}`,
      });
    }
  }
  return issues;
}

/** A fingerprint of the issue list, so the same findings aren't emailed every night. */
export function issuesKey(issues: AccessIssue[]) {
  return createHash("sha256")
    .update(issues.map((i) => `${i.clientId}:${i.line}`).sort().join("\n"))
    .digest("hex");
}

export type AuditDeps = { alert: typeof sendStaffAlert };

/**
 * Runs the check and emails the studio when there are findings that weren't in the last
 * email. `lastKey` is the fingerprint of what was last sent; the new one is returned.
 */
export async function runAccessAudit(lastKey: string | null, deps: Partial<AuditDeps> = {}) {
  const issues = await findAccessIssues();
  const key = issues.length ? issuesKey(issues) : null;
  if (issues.length && key !== lastKey) {
    const alert = deps.alert ?? sendStaffAlert;
    const clientIds = [...new Set(issues.map((i) => i.clientId))];
    await alert({
      kind: "access-audit",
      headline:
        issues.length === 1
          ? "One client can't open something they should."
          : `${issues.length} access problems: clients can't open things they should.`,
      facts: issues.slice(0, 20).map((i) => ({ label: i.clientName, value: i.line })),
      detail:
        (issues.length > 20 ? `…and ${issues.length - 20} more.\n` : "") +
        "Fix it under Manage access on the client page. This check runs nightly and emails " +
        "again only when the list changes.",
      actionPath: clientIds.length === 1 ? `/admin/clients/${clientIds[0]}` : "/admin/clients",
      actionLabel: clientIds.length === 1 ? "Open client" : "Open clients",
    });
    await db.activity.create({
      data: { actor: "Worker", action: `access check: ${issues.length} problem(s), studio emailed` },
    });
  }
  return { issues, key };
}
