import { test, expect } from "@playwright/test";
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

/** Forgot password: who gets a link, and what a link can do. See e2e/password-reset-harness.ts. */
test("forgot password links", async () => {
  test.slow(); // spins up its own database and applies migrations to it
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "password-reset-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, out, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout: out }))
    );
  });
  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();
  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(20);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});

const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

test.describe("the pages", () => {
  const stamp = Date.now();
  const userId = `zz-reset-${stamp}`;
  const email = `reset-${stamp}@ssh.studio`;

  test.beforeAll(() => {
    const clientId = sql("SELECT cm.clientId FROM ClientMember cm JOIN User u ON u.id=cm.userId WHERE u.email='sasha@ssh.studio' LIMIT 1;");
    sql(
      `INSERT INTO User (id, name, email, passwordHash, role, isAdmin, notifyDelivery, notifyExpiry, mustChangePassword, createdAt) VALUES ('${userId}','Rita Reset','${email}','x','VIEWER',0,1,1,1,CURRENT_TIMESTAMP);`
    );
    sql(`INSERT INTO ClientMember (id, userId, clientId, role, createdAt) VALUES ('zz-cm-${stamp}','${userId}','${clientId}','VIEWER',CURRENT_TIMESTAMP);`);
  });
  test.afterAll(() => {
    sql(`DELETE FROM PasswordReset WHERE userId='${userId}';`);
    sql(`DELETE FROM Session WHERE userId='${userId}';`);
    sql(`DELETE FROM ClientMember WHERE userId='${userId}';`);
    sql(`DELETE FROM User WHERE id='${userId}';`);
  });

  test("Forgot password asks for the email first, then says it is on its way", async ({ page }) => {
    // Its own address: login-form.spec.ts spends the per-IP allowance on purpose.
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.9.${stamp % 250}.7` });
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password" }).click();
    await expect(page.getByText("Type your email above, then press Forgot password.")).toBeVisible();
    await page.getByPlaceholder(/@/).fill(email);
    await page.getByRole("button", { name: "Forgot password" }).click();
    await expect(page.getByText(/emailed it a link/)).toBeVisible();
    await expect.poll(() => sql(`SELECT count(*) FROM PasswordReset WHERE userId='${userId}' AND usedAt IS NULL;`)).toBe("1");
  });

  test("a link sets the password and signs them in, once", async ({ page }) => {
    const token = randomBytes(32).toString("hex");
    sql(`DELETE FROM PasswordReset WHERE userId='${userId}';`);
    sql(
      `INSERT INTO PasswordReset (id, userId, tokenHash, expiresAt, createdAt) VALUES ('zz-pr-${stamp}','${userId}','${sha(token)}',datetime('now','+30 minutes'),CURRENT_TIMESTAMP);`
    );
    // Prisma stores DateTime as epoch milliseconds in SQLite.
    sql(`UPDATE PasswordReset SET expiresAt=${Date.now() + 30 * 60_000} WHERE id='zz-pr-${stamp}';`);

    await page.goto(`/reset/${token}`);
    await expect(page.getByTestId("reset-page")).toContainText(email);
    await page.locator("#new-password").fill("a-new-password-9");
    await page.locator("#confirm-password").fill("a-new-password-9");
    await page.getByRole("button", { name: "Save and sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/reset") && !u.pathname.startsWith("/login"));
    expect(sql(`SELECT mustChangePassword FROM User WHERE id='${userId}';`)).toBe("0");

    await page.goto(`/reset/${token}`);
    await expect(page.getByTestId("reset-expired")).toBeVisible();
  });

  test("a made-up link shows the way back", async ({ page }) => {
    await page.goto(`/reset/${"0".repeat(64)}`);
    await expect(page.getByTestId("reset-expired")).toContainText("Ask for a new one");
  });
});
