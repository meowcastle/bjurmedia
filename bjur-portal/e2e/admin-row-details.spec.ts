import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * A media row carries the delivery week and the folder, and no caption editor. Titles and
 * captions are edited in the calendar drawer, which owns admin captions; the table used to
 * hold a second editor behind a Details toggle, which made two places to change one
 * caption and no way to tell which saved last.
 */
test("a row has the week and folder inline, and no caption editor", async ({ page }) => {
  await page.goto("/admin/media?project=p1");

  const row = page.locator('[data-testid^="asset-row-"]').first();
  await expect(row.getByLabel(/^Delivery week for /)).toBeVisible();
  await expect(row.getByRole("button", { name: /details/i })).toHaveCount(0);
  await expect(page.getByPlaceholder("IG & YT caption…")).toHaveCount(0);
  await expect(page.getByPlaceholder("e.g. TOVA (FAM ONLY)")).toHaveCount(0);
});
