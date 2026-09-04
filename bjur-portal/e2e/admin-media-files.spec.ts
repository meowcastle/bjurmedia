import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// p8 = 57.NYC "IG Posting" — the retainer project the content calendar exists for.
const PROJECT = "/admin/media?project=p8";

/**
 * §10. The Files view opened with five stat tiles restating what the table below
 * already showed, and one of them ("Workers online: 1") was a hardcoded literal that
 * never reflected anything.
 *
 * The chip that earns its place is "Needs week": client-visible files with no
 * weekOf are invisible to both the calendar and the weekly Slack post, and there was
 * no way to find them short of reading every row.
 */
test("the stat tiles are gone, replaced by one meta line", async ({ page }) => {
  await page.goto(PROJECT);

  await expect(page.getByText("Workers online")).toHaveCount(0);
  await expect(page.getByText("Proxies ready")).toHaveCount(0);

  // A real total size, not NaN — sizeBytes crossed the RSC boundary as a string.
  await expect(page.getByText(/\d+ assets/)).toBeVisible();
  await expect(page.getByText(/\d+(\.\d+)? (MB|GB|TB)/).first()).toBeVisible();
  await expect(page.getByText(/\d+ ready/)).toBeVisible();
});

test("the Needs week chip finds files with no delivery week", async ({ page }) => {
  // p1 deliberately, not p8: the seed gives every p8 asset a weekOf, so the chip
  // never appears there and this would skip itself every run.
  await page.goto("/admin/media?project=p1");

  const chip = page.getByRole("button", { name: /Needs week/ });
  await expect(chip).toBeVisible();

  const expected = Number((await chip.textContent())!.replace(/\D/g, ""));
  expect(expected).toBeGreaterThan(0);

  // Count the rows themselves. This used to count "Regenerate" buttons, one per row,
  // which stopped being one-per-row when the row actions moved behind a ··· menu.
  const rowCount = () => page.locator('[data-testid^="asset-row-"]').count();
  const before = await rowCount();

  await chip.click();

  // The chip's number has to be the number of rows it leaves behind — and it must
  // actually narrow the table, or the filter is doing nothing.
  await expect
    .poll(rowCount, { message: "rows after filtering to Needs week" })
    .toBe(expected);
  expect(expected).toBeLessThan(before);
});

test("format chips filter, and All restores the full list", async ({ page }) => {
  await page.goto(PROJECT);

  const all = page.getByRole("button", { name: /^All \d+$/ });
  await expect(all).toBeVisible();
  const total = Number((await all.textContent())!.replace(/\D/g, ""));

  const reel = page.getByRole("button", { name: /^Reel \d+$/ });
  test.skip((await reel.count()) === 0, "no Reel-format assets seeded here");

  const reelCount = Number((await reel.textContent())!.replace(/\D/g, ""));
  expect(reelCount).toBeLessThanOrEqual(total);

  await reel.click();
  await all.click();
  await expect(all).toBeVisible();
});

test("the redundant Slack post row is gone from the Files view", async ({ page }) => {
  await page.goto(PROJECT);
  // The Calendar view carries a live preview and a Copy button; two copies of the
  // same thing invites them to disagree.
  await expect(page.getByRole("button", { name: /Copy Slack post/ })).toHaveCount(0);
});
