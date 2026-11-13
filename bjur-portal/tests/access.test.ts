// Who can open what, and who gets emailed a link — against a real, throwaway SQLite
// database built from the migrations. Run with `pnpm test`.
//
// The cases are the ones that have gone wrong for real clients: on 2026-11-13 an owner of
// one client (HMU) who was limited to two projects on another (Space Invader) couldn't
// open his own client's delivery, and was emailed a release receipt for it anyway.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dir = mkdtempSync(path.join(tmpdir(), "portal-access-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.PLAYWRIGHT_TEST = "1"; // db.ts: no WAL switch on a fresh file
delete process.env.DELIVERY_EMAILS;

/* eslint-disable @typescript-eslint/no-explicit-any */
let db: any;
let access: typeof import("../src/lib/projectAccess");
let clientMail: typeof import("../src/lib/clientMail");
let guard: typeof import("../src/lib/linkGuard");
let audit: typeof import("../src/lib/accessAudit");

// Fixture ids, filled in before().
const id: Record<string, string> = {};
let n = 0;
const uniq = () => `t${++n}`;

async function client(name: string) {
  return (await db.client.create({ data: { name, username: `${name.toLowerCase()}-${uniq()}` } })).id;
}
async function project(clientId: string, title: string, extra: Record<string, unknown> = {}) {
  return (
    await db.project.create({ data: { clientId, title, path: `${title}/${uniq()}`, inboxSlug: uniq(), ...extra } })
  ).id;
}
async function seat(name: string, extra: Record<string, unknown> = {}) {
  return (
    await db.user.create({ data: { name, email: `${name.toLowerCase()}-${uniq()}@example.com`, passwordHash: "x", ...extra } })
  ).id;
}
const member = (userId: string, clientId: string, role: string) =>
  db.clientMember.create({ data: { userId, clientId, role } });
const limit = (userId: string, projectId: string, role: string) =>
  db.projectMember.create({ data: { userId, projectId, role } });
const asset = (projectId: string) =>
  db.asset.create({
    data: {
      projectId, kind: "VIDEO", format: "Reel", orientation: "portrait",
      name: `${uniq()}.mp4`, relPath: `x/${uniq()}.mp4`, sizeBytes: BigInt(1),
    },
  });

/** A signed-in session, shaped as getSessionUser() returns it. */
async function sessionFor(userId: string, activeClientId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const rows = await db.clientMember.findMany({ where: { userId }, include: { client: true } });
  const active = rows.find((m: any) => m.clientId === activeClientId)!;
  const s = await db.session.create({
    data: { userId, tokenHash: uniq(), device: "test", activeClientId },
  });
  return {
    id: userId, name: user.name, email: user.email, isAdmin: user.isAdmin,
    clientId: activeClientId, role: active.role,
    memberships: rows.map((m: any) => ({ clientId: m.clientId, clientName: m.client.name, role: m.role })),
    sessionId: s.id, mustChangePassword: false,
  };
}

/** A stand-in for the staff alert email that records what it was asked to send. */
function alertSpy() {
  const calls: any[] = [];
  const fn = (async (props: any) => {
    calls.push(props);
    return { sent: 1 };
  }) as any;
  return { calls, fn };
}

before(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: process.env, stdio: "ignore" });
  ({ db } = await import("../src/lib/db"));
  access = await import("../src/lib/projectAccess");
  clientMail = await import("../src/lib/clientMail");
  guard = await import("../src/lib/linkGuard");
  audit = await import("../src/lib/accessAudit");

  id.hmu = await client("HMU");
  id.si = await client("SpaceInvader");
  id.hmuClips = await project(id.hmu, "Halloween Clips");
  id.hmuDraft = await project(id.hmu, "Draft", { status: "DRAFT" });
  id.siParty = await project(id.si, "Halloween Party");
  id.siOther = await project(id.si, "Masquerade");
  id.siFilm = await project(id.si, "Film", { type: "FILM" });

  // Hawthorne: owner on HMU with no limits there; downloader on Space Invader, limited
  // to one project.
  id.haw = await seat("Hawthorne");
  await member(id.haw, id.hmu, "OWNER");
  await member(id.haw, id.si, "DOWNLOADER");
  await limit(id.haw, id.siParty, "DOWNLOADER");

  id.bob = await seat("Bob"); // Space Invader owner, no limits
  await member(id.bob, id.si, "OWNER");

  id.carl = await seat("Carl"); // limited to one SI project, and reviewing the SI film
  await member(id.carl, id.si, "VIEWER");
  await limit(id.carl, id.siOther, "VIEWER");
  await db.reviewer.create({ data: { projectId: id.siFilm, kind: "SEAT", userId: id.carl, email: "c@x", name: "Carl" } });

  id.dee = await seat("Dee", { deactivatedAt: new Date() }); // switched off
  await member(id.dee, id.hmu, "OWNER");

  id.admin = await seat("Studio", { isAdmin: true });
});

after(async () => {
  await db?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("decideAccess", () => {
  const base = { isAdmin: false, projectId: "p1" };
  test("no membership on the client: no", () => {
    assert.deepEqual(access.decideAccess({ ...base, memberRole: null, limits: [] }), { allowed: false });
  });
  test("member with no limits on this client: everything, at their client role", () => {
    assert.deepEqual(access.decideAccess({ ...base, memberRole: "OWNER", limits: [] }), { allowed: true, role: "OWNER" });
  });
  test("limited: only the listed projects, at the listed role", () => {
    const limits = [{ projectId: "p1", role: "VIEWER" as const }];
    assert.deepEqual(access.decideAccess({ ...base, memberRole: "OWNER", limits }), { allowed: true, role: "VIEWER" });
    assert.deepEqual(access.decideAccess({ ...base, projectId: "p2", memberRole: "OWNER", limits }), { allowed: false });
  });
  test("admin: always, as owner", () => {
    assert.deepEqual(access.decideAccess({ ...base, isAdmin: true, memberRole: null, limits: [] }), { allowed: true, role: "OWNER" });
  });
});

describe("a seat on two clients (the 2026-11-13 bug)", () => {
  test("limits on one client don't hide the other client's projects", async () => {
    const r = await access.seatProjectAccess(id.haw, { id: id.hmuClips, clientId: id.hmu });
    assert.deepEqual(r, { allowed: true, role: "OWNER" });
  });
  test("limits still hold on the client they were set on", async () => {
    assert.deepEqual(await access.seatProjectAccess(id.haw, { id: id.siParty, clientId: id.si }), { allowed: true, role: "DOWNLOADER" });
    assert.deepEqual(await access.seatProjectAccess(id.haw, { id: id.siOther, clientId: id.si }), { allowed: false });
  });
  test("project list: everything on HMU, only the listed project on Space Invader", async () => {
    assert.equal(await access.getAccessibleProjectIds(await sessionFor(id.haw, id.hmu)), null);
    assert.deepEqual(await access.getAccessibleProjectIds(await sessionFor(id.haw, id.si)), [id.siParty]);
  });
  test("a link to HMU opened while on Space Invader switches client instead of 404ing", async () => {
    const s = await sessionFor(id.haw, id.si);
    assert.deepEqual(await access.getProjectAccess(s, { id: id.hmuClips, clientId: id.hmu }), { allowed: false });
    assert.equal(await access.switchToProjectClient(s, { clientId: id.hmu }), true);
    const row = await db.session.findUnique({ where: { id: s.sessionId } });
    assert.equal(row.activeClientId, id.hmu);
  });
  test("no switching onto a client the seat isn't on", async () => {
    const s = await sessionFor(id.bob, id.si);
    assert.equal(await access.switchToProjectClient(s, { clientId: id.hmu }), false);
  });
});

describe("everyone else", () => {
  test("not a member: no", async () => {
    assert.deepEqual(await access.seatProjectAccess(id.bob, { id: id.hmuClips, clientId: id.hmu }), { allowed: false });
  });
  test("switched-off login: no, even as an owner", async () => {
    assert.deepEqual(await access.seatProjectAccess(id.dee, { id: id.hmuClips, clientId: id.hmu }), { allowed: false });
  });
  test("studio admin: yes", async () => {
    assert.deepEqual(await access.seatProjectAccess(id.admin, { id: id.hmuClips, clientId: id.hmu }), { allowed: true, role: "OWNER" });
  });
  test("a link to a project that isn't live doesn't open", async () => {
    assert.equal(await access.canOpenProjectLink(id.haw, { id: id.hmuDraft, clientId: id.hmu, status: "DRAFT" }), false);
    assert.equal(await access.canOpenProjectLink(id.haw, { id: id.hmuClips, clientId: id.hmu, status: "LIVE" }), true);
  });
  test("a limited reviewer sees the film they review in their list", async () => {
    const ids = await access.getAccessibleProjectIds(await sessionFor(id.carl, id.si));
    assert.deepEqual(new Set(ids), new Set([id.siOther, id.siFilm]));
  });
});

describe("Manage access", () => {
  test("saving one client's access leaves the seat's other clients alone", async () => {
    await access.replaceClientLimits(id.haw, id.hmu, [{ projectId: id.hmuClips, role: "OWNER" }]);
    const rows = await db.projectMember.findMany({ where: { userId: id.haw }, select: { projectId: true } });
    assert.deepEqual(new Set(rows.map((r: any) => r.projectId)), new Set([id.hmuClips, id.siParty]));

    await access.replaceClientLimits(id.haw, id.hmu, []); // back to every project on HMU
    const after = await db.projectMember.findMany({ where: { userId: id.haw }, select: { projectId: true } });
    assert.deepEqual(after.map((r: any) => r.projectId), [id.siParty]);
  });
});

describe("the check before a client email goes out", () => {
  test("release receipt: owners who can open it get it; one who can't is held back and the studio told", async () => {
    const eve = await seat("Eve"); // an HMU owner wrongly limited to the draft
    await member(eve, id.hmu, "OWNER");
    await limit(eve, id.hmuDraft, "OWNER");

    const sent: string[] = [];
    const spy = alertSpy();
    const r = await clientMail.sendPaymentReleaseReceipt(id.hmuClips, {
      sendReleased: (async (to: string) => { sent.push(to); return { sent: true }; }) as any,
      alert: spy.fn,
    });

    const haw = await db.user.findUniqueOrThrow({ where: { id: id.haw } });
    assert.deepEqual(sent, [haw.email]); // Hawthorne yes; Eve held back; Dee is switched off
    assert.equal(r.sent, 1);
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].kind, "link-blocked");
    assert.match(spy.calls[0].headline, /Eve can't open Halloween Clips/);
    await db.projectMember.deleteMany({ where: { userId: eve } });
    await db.clientMember.deleteMany({ where: { userId: eve } });
  });

  test("seats limited to other projects are dropped quietly when that's expected", async () => {
    const spy = alertSpy();
    const carl = await db.user.findUniqueOrThrow({ where: { id: id.carl } });
    const bob = await db.user.findUniqueOrThrow({ where: { id: id.bob } });
    const r = await guard.guardProjectEmail(
      {
        project: { id: id.siParty, clientId: id.si, status: "LIVE", title: "Halloween Party", clientName: "SpaceInvader" },
        recipients: [carl, bob],
        email: "new files",
        expected: false,
      },
      { alert: spy.fn }
    );
    assert.deepEqual(r.reachable.map((u) => u.id), [id.bob]);
    assert.deepEqual(r.heldBack.map((u) => u.id), [id.carl]);
    assert.equal(spy.calls.length, 0);
  });
});

describe("the nightly access check", () => {
  test("reports an owner who can't open a live project, a project nobody can open, and a reviewer with no login on the client", async () => {
    const lone = await client("Lone");
    const shown = await project(lone, "Shown");
    const hidden = await project(lone, "Hidden");
    await asset(hidden);
    const solo = await seat("Solo");
    await member(solo, lone, "VIEWER");
    await limit(solo, shown, "VIEWER");
    const gus = await seat("Gus"); // reviews the SI film but isn't on Space Invader
    await db.reviewer.create({ data: { projectId: id.siFilm, kind: "SEAT", userId: gus, email: "g@x", name: "Gus" } });
    const ola = await seat("Ola"); // owner limited to one of two
    await member(ola, lone, "OWNER");
    await limit(ola, shown, "OWNER");

    const lines = (await audit.findAccessIssues()).map((i) => i.line);
    assert.ok(lines.includes("Ola is an owner but can't open Hidden"), lines.join("\n"));
    assert.ok(lines.includes("nobody on Lone can open Hidden (1 files)"), lines.join("\n"));
    assert.ok(lines.some((l) => l.startsWith("Gus reviews Film")), lines.join("\n"));
    // Nothing about Hawthorne: he can open everything he should.
    assert.ok(!lines.some((l) => l.includes("Hawthorne")), lines.join("\n"));

    const spy = alertSpy();
    const first = await audit.runAccessAudit(null, { alert: spy.fn });
    assert.equal(spy.calls.length, 1);
    await audit.runAccessAudit(first.key, { alert: spy.fn }); // same list: no second email
    assert.equal(spy.calls.length, 1);
  });
});
