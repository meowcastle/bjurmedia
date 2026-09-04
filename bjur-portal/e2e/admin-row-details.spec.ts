import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * §10. Folder, title and both caption boxes used to sit open on every row, so a
 * thirteen-file project was a couple of thousand pixels of mostly-empty form and the
 * table stopped reading as a table. The delivery week stays on the row, as the spec has
 * it; the rest folds away.
 */
test("row editors are folded away until asked for", async ({ page }) => {
  await page.goto("/admin/media?project=p1");

  const row = page.locator('[data-testid^="asset-row-"]').first();

  // The week is the one field the spec keeps inline.
  await expect(row.getByLabel(/^Delivery week for /)).toBeVisible();
  await expect(row.getByPlaceholder("IG & YT caption…")).toHaveCount(0);

  const toggle = row.getByRole("button", { name: /details/i });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(row.getByPlaceholder("IG & YT caption…")).toBeVisible();
  await expect(row.getByPlaceholder("e.g. TOVA (FAM ONLY)")).toBeVisible();

  await toggle.click();
  await expect(row.getByPlaceholder("IG & YT caption…")).toHaveCount(0);
});

test("folding the row keeps the table shorter than leaving it open", async ({ page }) => {
  await page.goto("/admin/media?project=p1");
  const row = page.locator('[data-testid^="asset-row-"]').first();

  const collapsed = (await row.boundingBox())!.height;
  await row.getByRole("button", { name: /details/i }).click();
  await expect(row.getByPlaceholder("IG & YT caption…")).toBeVisible();
  const expanded = (await row.boundingBox())!.height;

  expect(expanded).toBeGreaterThan(collapsed);
});

test("expanding one row does not expand the others", async ({ page }) => {
  await page.goto("/admin/media?project=p1");
  const rows = page.locator('[data-testid^="asset-row-"]');

  await rows.nth(0).getByRole("button", { name: /details/i }).click();
  await expect(rows.nth(0).getByPlaceholder("IG & YT caption…")).toBeVisible();
  await expect(rows.nth(1).getByPlaceholder("IG & YT caption…")).toHaveCount(0);
});
