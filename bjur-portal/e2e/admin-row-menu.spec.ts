import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * §10. Every row carried up to six action buttons, so the action column read as a
 * toolbar and Delete sat a few pixels from the routine controls. One ··· menu now,
 * with the same open/close contract as the header's account menu.
 */
test("row actions are hidden until the menu is opened", async ({ page }) => {
  await page.goto("/admin/media?project=p1");

  const row = page.locator('[data-testid^="asset-row-"]').first();
  await expect(row.getByRole("menu")).toHaveCount(0);
  await expect(row.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);

  await row.getByRole("button", { name: /^Actions for / }).click();

  await expect(row.getByRole("menu")).toBeVisible();
  await expect(row.getByRole("menuitem", { name: /^(Hide from client|Show client)$/ })).toBeVisible();
  await expect(row.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test("the menu closes on Escape and on an outside click", async ({ page }) => {
  await page.goto("/admin/media?project=p1");
  const row = page.locator('[data-testid^="asset-row-"]').first();
  const trigger = row.getByRole("button", { name: /^Actions for / });

  await trigger.click();
  await expect(row.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row.getByRole("menu")).toHaveCount(0);

  await trigger.click();
  await expect(row.getByRole("menu")).toBeVisible();
  await page.locator("h1").first().click();
  await expect(row.getByRole("menu")).toHaveCount(0);
});

test("only one row's menu is open at a time", async ({ page }) => {
  await page.goto("/admin/media?project=p1");
  const rows = page.locator('[data-testid^="asset-row-"]');
  test.skip((await rows.count()) < 2, "needs two rows");

  await rows.nth(0).getByRole("button", { name: /^Actions for / }).click();
  await expect(rows.nth(0).getByRole("menu")).toBeVisible();

  // Opening the second closes the first — clicking it is an outside click for the first.
  await rows.nth(1).getByRole("button", { name: /^Actions for / }).click();
  await expect(rows.nth(1).getByRole("menu")).toBeVisible();
  await expect(rows.nth(0).getByRole("menu")).toHaveCount(0);
});

test("Delete from the menu still asks before removing anything", async ({ page }) => {
  await page.goto("/admin/media?project=p1");
  const rows = page.locator('[data-testid^="asset-row-"]');
  const before = await rows.count();
  const row = rows.first();

  await row.getByRole("button", { name: /^Actions for / }).click();
  await row.getByRole("menuitem", { name: "Delete" }).click();

  // The menu gets out of the way and the row asks in place.
  await expect(row.getByRole("menu")).toHaveCount(0);
  await expect(row.getByText("Delete permanently?")).toBeVisible();

  await row.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row.getByText("Delete permanently?")).toHaveCount(0);
  expect(await rows.count()).toBe(before);
});
