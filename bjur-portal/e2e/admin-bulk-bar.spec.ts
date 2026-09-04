import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

const PROJECT = "/admin/media?project=p1";

/**
 * §10 bulk bar. The actions used to sit in an inline block above the table, which
 * pushed the rows down on selection and scrolled out of view as soon as you started
 * picking files further down. Fixed to the bottom, the count and the actions stay
 * where the eye already is — same pattern as the client-side selection bar.
 */
test("selecting rows raises the bar with a count and a size", async ({ page }) => {
  await page.goto(PROJECT);

  const bar = page.getByTestId("bulk-bar");
  await expect(bar).toHaveCount(0);

  await page.locator('input[type="checkbox"]').nth(1).check();

  await expect(bar).toBeVisible();
  await expect(bar.getByText(/^1 selected$/)).toBeVisible();
  // Scoped to the bar: the page meta line above the table also prints a size, and an
  // unscoped match would pass on that one whether or not the bar showed anything.
  // sizeBytes reaches the client as a string — BigInt cannot cross the RSC boundary.
  await expect(bar.getByText(/^\d+(\.\d+)? (MB|GB|TB)$/)).toBeVisible();
});

test("Clear dismisses the bar without touching the files", async ({ page }) => {
  await page.goto(PROJECT);

  const rows = page.locator('[data-testid^="asset-row-"]');
  const rowsBefore = await rows.count();

  await page.locator('input[type="checkbox"]').nth(1).check();
  await expect(page.getByText(/^1 selected$/)).toBeVisible();

  await page.getByTestId("bulk-bar").getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText(/^1 selected$/)).toHaveCount(0);

  // Clearing a selection must not have removed anything.
  expect(await rows.count()).toBe(rowsBefore);
});

test("Delete asks before doing anything irreversible", async ({ page }) => {
  await page.goto(PROJECT);
  await page.locator('input[type="checkbox"]').nth(1).check();

  await page.getByTestId("bulk-bar").getByRole("button", { name: "Delete", exact: true }).click();

  // A confirm step, not an immediate delete — the files are still there.
  await expect(page.getByText("Delete permanently?")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Confirm \(\d+\)$/ })).toBeVisible();

  await page.getByTestId("bulk-bar").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Delete permanently?")).toHaveCount(0);
  await expect(page.getByText(/^1 selected$/)).toBeVisible();
});
