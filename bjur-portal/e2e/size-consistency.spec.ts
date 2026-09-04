import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * One file used to read 1.4 GB in the size column and contribute 1.3 GB to the bulk
 * bar's total: the server formatted decimal GB and the client formatted binary GiB
 * while labelling it GB. Same bytes, two answers, on the same screen.
 */
test("a single selected file's total matches its own size column", async ({ page }) => {
  await page.goto("/admin/media?project=p1");

  const row = page.locator('[data-testid^="asset-row-"]').first();
  const rowSize = (await row.getByText(/^\d+(\.\d+)? (MB|GB|TB)$/).first().textContent())!.trim();

  await row.locator('input[type="checkbox"]').check();
  const bar = page.getByTestId("bulk-bar");
  await expect(bar.getByText("1 selected")).toBeVisible();

  const barSize = (await bar.getByText(/^\d+(\.\d+)? (MB|GB|TB)$/).textContent())!.trim();
  expect(barSize).toBe(rowSize);
});

test("the project meta line and the select-all total agree", async ({ page }) => {
  await page.goto("/admin/media?project=p1");

  const meta = (await page
    .getByText(/^\d+(\.\d+)? (MB|GB|TB)$/)
    .first()
    .textContent())!.trim();

  // The header checkbox selects every row the table is showing, which with no filter
  // applied is the whole project the meta line is describing.
  await page.locator('input[type="checkbox"]').first().check();
  const bar = page.getByTestId("bulk-bar");
  await expect(bar).toBeVisible();

  const barSize = (await bar.getByText(/^\d+(\.\d+)? (MB|GB|TB)$/).textContent())!.trim();
  expect(barSize).toBe(meta);
});
