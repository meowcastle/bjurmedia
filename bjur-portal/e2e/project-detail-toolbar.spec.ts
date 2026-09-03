import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/sasha.json" });

const PROJECT = "/p/p1";

/**
 * §3 of the design handoff: format is the default grouping, chips carry counts, every
 * download control states a size, and selecting files raises a bar at the bottom
 * instead of relabelling the header button.
 *
 * The sizes are the part worth pinning. They come from Asset.sizeBytes, a BigInt that
 * cannot cross the RSC boundary — it is serialised to a string on the way out, so a
 * regression there shows up as "NaN" or "0 MB" rather than a crash.
 */
test("chips carry counts and the header states a total size", async ({ page }) => {
  await page.goto(PROJECT);

  // "All 13" rather than "All": the count is part of the label now.
  await expect(page.getByRole("button", { name: /^All \d+$/ })).toBeVisible();

  const download = page.getByRole("button", { name: /Download all · /  });
  await expect(download).toBeVisible();
  // A real size, not NaN and not zero — the BigInt survived serialisation.
  await expect(download).toHaveText(/Download all · \d+(\.\d+)? (MB|GB)$/);
});

test("defaults to grouping by format, not week", async ({ page }) => {
  await page.goto(PROJECT);

  // Format group headers are format names; week headers read "Week of ...".
  await expect(page.getByText(/^Week of /)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "By Format" })).toBeVisible();
});

test("selecting a file raises the selection bar with a count and size", async ({ page }) => {
  await page.goto(PROJECT);

  // Nothing selected: no bar.
  await expect(page.getByText(/^\d+ selected$/)).toHaveCount(0);

  await page.getByRole("checkbox", { name: /^Select / }).first().click();

  const bar = page.getByText(/^1 selected$/);
  await expect(bar).toBeVisible();
  await expect(page.getByRole("button", { name: /Download 1 · \d/ })).toBeVisible();

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText(/^1 selected$/)).toHaveCount(0);
});

test("each group header states its own size", async ({ page }) => {
  await page.goto(PROJECT);

  // "3 files · 5.5 GB" — the count and size of that format bucket.
  await expect(page.getByText(/\d+ (file|item)s? · \d+(\.\d+)? (MB|GB)/).first()).toBeVisible();
});
