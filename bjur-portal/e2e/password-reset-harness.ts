/**
 * "Forgot password", against a throwaway database with only the two mail senders injected.
 *
 * The rules worth defending: only a client login that could sign in gets a link; a link
 * works once and not after 30 minutes; asking again kills the older link; the new
 * password signs out every device; and a login nobody has signed in to yet can use it.
 *
 * Run by e2e/password-reset.spec.ts. Prints one JSON line of results.
 */
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

process.env.PORTAL_URL = "https://portal.example.test";
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;
bootstrapHarnessDb();

const results: CheckResult[] = [];
const check = makeChecker(results);

type LinkMail = { to: string; resetUrl: string; clientName: string };

async function main() {
  const { db } = await import("../src/lib/db");
  const { verifyPassword, hashPassword } = await import("../src/lib/auth");
  const { requestPasswordReset, completePasswordReset, findUsableReset } = await import("../src/lib/passwordReset");

  const links: LinkMail[] = [];
  const changed: string[] = [];
  const deps = {
    sendLink: async (to: string, p: { resetUrl: string; clientName: string }) => {
      links.push({ to, resetUrl: p.resetUrl, clientName: p.clientName });
      return { sent: true };
    },
    sendChanged: async (to: string) => {
      changed.push(to);
      return { sent: true };
    },
  };
  const tokenOf = (m: LinkMail) => new URL(m.resetUrl).pathname.split("/").pop()!;

  const hash = await hashPassword("old-password-1");
  const client = await db.client.create({ data: { name: "Momentos", username: `m-${Date.now()}` } });
  const off = await db.client.create({ data: { name: "Gone Co", username: `g-${Date.now()}`, status: "DISABLED" } });
  const mk = async (email: string, extra: Record<string, unknown> = {}, clientId: string | null = client.id) => {
    const u = await db.user.create({ data: { name: "Dana Reyes", email, passwordHash: hash, ...extra } });
    if (clientId) await db.clientMember.create({ data: { userId: u.id, clientId, role: "VIEWER" } });
    return u;
  };

  const seat = await mk("dana@momentos.test", { lastLoginAt: new Date() });
  const fresh = await mk("new@momentos.test", { mustChangePassword: true });
  await mk("gone@momentos.test", { deactivatedAt: new Date() });
  await mk("staff@bjur.test", { isAdmin: true }, null);
  await mk("parked@gone.test", {}, off.id);

  // --- who gets a link -----------------------------------------------------------------
  const sent = await requestPasswordReset("  Dana@Momentos.test ", "/p/abc/review", deps);
  check("a client login gets a link", sent.outcome === "sent" && links.length === 1, `outcome=${sent.outcome}`);
  check("addressed to them", links[0]?.to === "dana@momentos.test");
  check("named for their client", links[0]?.clientName === "Momentos");
  check(
    "the link carries where they were going",
    links[0]?.resetUrl.startsWith("https://portal.example.test/reset/") && links[0].resetUrl.endsWith("?next=%2Fp%2Fabc%2Freview"),
    links[0]?.resetUrl
  );
  const row = await db.passwordReset.findFirst({ where: { userId: seat.id } });
  check("only a hash of the token is stored", !!row && row.tokenHash !== tokenOf(links[0]) && !JSON.stringify(row).includes(tokenOf(links[0])));
  check(
    "it lasts 30 minutes",
    !!row && Math.abs(row.expiresAt.getTime() - Date.now() - 30 * 60_000) < 10_000
  );

  for (const [email, why] of [
    ["gone@momentos.test", "a deactivated login"],
    ["staff@bjur.test", "a studio login"],
    ["parked@gone.test", "a login whose only client is switched off"],
    ["nobody@momentos.test", "an address with no login"],
  ] as const) {
    const before = links.length;
    const r = await requestPasswordReset(email, null, deps);
    check(`${why} gets no link`, links.length === before && r.outcome !== "sent", `outcome=${r.outcome}`);
  }
  await requestPasswordReset("new@momentos.test", "//evil.test", deps);
  check("an off-site next is dropped", !links.at(-1)!.resetUrl.includes("evil"), links.at(-1)!.resetUrl);

  // --- asking again ----------------------------------------------------------------------
  const first = tokenOf(links[0]);
  await requestPasswordReset("dana@momentos.test", null, deps);
  const second = tokenOf(links.at(-1)!);
  check("asking again kills the older link", (await findUsableReset(first)) === null);
  check("and the new one works", (await findUsableReset(second)) !== null);
  await requestPasswordReset("dana@momentos.test", null, deps);
  const limited = await requestPasswordReset("dana@momentos.test", null, deps);
  check("a fourth ask in the hour sends nothing", limited.outcome === "limited");
  const live = tokenOf(links.at(-1)!);

  // --- using it ------------------------------------------------------------------------
  await db.session.create({ data: { userId: seat.id, tokenHash: `s-${Date.now()}`, device: "Old laptop" } });
  check("a short password is refused", (await completePasswordReset(live, "short", deps)).ok === false);
  check("and that does not spend the link", (await findUsableReset(live)) !== null);

  const done = await completePasswordReset(live, "brand-new-password", deps);
  check("the link sets a new password", done.ok === true);
  const after = await db.user.findUniqueOrThrow({ where: { id: seat.id } });
  check("which is the one that now works", await verifyPassword(after.passwordHash, "brand-new-password"));
  check("every other device is signed out", (await db.session.count({ where: { userId: seat.id } })) === 0);
  check("they are told it changed", changed.includes("dana@momentos.test"));
  check("it lands them on their client", done.ok && done.activeClientId === client.id);
  check("the link works once", (await completePasswordReset(live, "another-password", deps)).ok === false);

  // --- expiry --------------------------------------------------------------------------
  const fr = await requestPasswordReset("new@momentos.test", null, deps);
  check("a login that never signed in gets a link", fr.outcome === "sent");
  const freshToken = tokenOf(links.at(-1)!);
  await db.passwordReset.updateMany({ where: { userId: fresh.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  check("an expired link does nothing", (await completePasswordReset(freshToken, "fresh-password-1", deps)).ok === false);

  await requestPasswordReset("new@momentos.test", null, deps);
  const ok = await completePasswordReset(tokenOf(links.at(-1)!), "fresh-password-1", deps);
  const freshAfter = await db.user.findUniqueOrThrow({ where: { id: fresh.id } });
  check("and with a fresh one they are in", ok.ok === true);
  check("without being asked to change it again", freshAfter.mustChangePassword === false);

  // A link sent before the login was switched off stops working when it is.
  const { createHash } = await import("node:crypto");
  const tok = "a".repeat(64);
  await db.passwordReset.create({
    data: { userId: seat.id, tokenHash: createHash("sha256").update(tok).digest("hex"), expiresAt: new Date(Date.now() + 60_000) },
  });
  await db.user.update({ where: { id: seat.id }, data: { deactivatedAt: new Date() } });
  check("a deactivated login's link is dead", (await completePasswordReset(tok, "whatever-123", deps)).ok === false);

  console.log(JSON.stringify(results));
}

main();
