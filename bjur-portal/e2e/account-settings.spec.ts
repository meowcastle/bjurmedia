import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/sasha.json" });

/**
 * §7. The page led with "Account settings" over a company kicker and said nothing
 * about who was signed in — which matters on a portal where several people from the
 * same client share a login screen.
 */
test("the identity block names the person, their client and their role", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Sasha Hale" })).toBeVisible();
  // Role comes out of the database shouted (OWNER); it should not read that way here.
  // exact:true, because getByText with a plain string matches case-insensitively —
  // "OWNER" would happily match the "Owner" we want.
  await expect(page.getByText("Owner", { exact: true })).toBeVisible();
  await expect(page.getByText("OWNER", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/sasha@ssh\.studio/)).toBeVisible();
});

test("signed-in devices are named as such, with relative times", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByText("Signed-in devices")).toBeVisible();
  await expect(page.getByText("Active sessions")).toHaveCount(0);

  // "2d ago" / "just now" rather than a raw locale timestamp.
  await expect(page.getByText(/just now|\d+[mhd] ago|\w{3} \d/).first()).toBeVisible();
});

test("the security note says what happens, not how it is hashed", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByText(/signs out your other devices/)).toBeVisible();
  // Argon2 is an implementation detail a client cannot act on.
  await expect(page.getByText(/argon2/i)).toHaveCount(0);
});
