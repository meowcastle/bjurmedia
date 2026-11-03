import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { CLIENT_PASSWORD } from "./helpers";

/**
 * The cut-ready mail's "Sign in and review cut N" link, followed by someone holding only
 * the temporary password in it: sign in, set a password, land on the review screen. Each
 * step used to drop the destination, so the first cut a new client ever got ended on the
 * project list, or on a sign-in form they had no password for.
 */
const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

// Marco, not Sasha: setting a password signs out every other session, and Sasha's is the
// saved one the rest of the suite runs on.
const EMAIL = "marco@ssh.studio";

test("a temporary password goes through the password change and on to the review", async ({ page }) => {
  const before = sql(`SELECT passwordHash FROM User WHERE email='${EMAIL}';`);
  // Sasha's hash is the shared test password, so Marco's "temporary" one is that.
  const temp = sql("SELECT passwordHash FROM User WHERE email='sasha@ssh.studio';");
  sql(`UPDATE User SET passwordHash='${temp}', mustChangePassword=1 WHERE email='${EMAIL}';`);
  try {
    await page.goto(`/login?next=${encodeURIComponent("/p/p2/review")}`);
    await page.locator('input[autocomplete="username"]').fill(EMAIL);
    await page.locator('input[autocomplete="current-password"]').fill(CLIENT_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/change-password\?next=%2Fp%2Fp2%2Freview$/);
    await page.locator("#current").fill(CLIENT_PASSWORD);
    await page.locator("#next").fill("a-new-password-1");
    await page.locator("#confirm").fill("a-new-password-1");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL("/p/p2/review");
    await expect(page.getByTestId("review-screen")).toBeVisible();
    expect(sql(`SELECT mustChangePassword FROM User WHERE email='${EMAIL}';`)).toBe("0");
  } finally {
    sql(`UPDATE User SET passwordHash='${before}', mustChangePassword=0 WHERE email='${EMAIL}';`);
  }
});

test("the review link signed out goes to sign in and keeps the way back", async ({ page }) => {
  await page.goto("/p/p2/review");
  await expect(page).toHaveURL(/\/login\?next=%2Fp%2Fp2%2Freview$/);
});

test("next only takes paths on this site", async ({ page }) => {
  await page.goto(`/login?next=${encodeURIComponent("//evil.example/x")}`);
  await page.locator('input[autocomplete="username"]').fill("sasha@ssh.studio");
  await page.locator('input[autocomplete="current-password"]').fill(CLIENT_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/");
});
