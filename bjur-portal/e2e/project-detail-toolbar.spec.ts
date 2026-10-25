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

test("groups by format, with one row of filters and nothing restated", async ({ page }) => {
  await page.goto(PROJECT);

  // Format group headers are format names; week headers read "Week of ...".
  await expect(page.getByText(/^Week of /)).toHaveCount(0);
  // The By Week toggle, the Wide/Vertical filter, per-group "Select all in…" and the
  // "Delivered · N files" strip are gone; the format chips already carry the counts.
  await expect(page.getByRole("button", { name: /^By (Format|Week)$/ })).toHaveCount(0);
  await expect(page.getByTestId("orientation-filter")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Select all in / })).toHaveCount(0);
  await expect(page.getByTestId("filter-ALL")).toBeVisible();
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

  // v13: the count sits under the label in Archivo and the size under it in mono.
  const group = page.getByTestId("file-group").first();
  await expect(group.locator(".bj-lab b")).toHaveText(/^\d+$/);
  await expect(group.getByTestId("group-size")).toHaveText(/^\d+(\.\d+)? (MB|GB)$/);
});

/**
 * The zip is handed to the browser rather than read into a blob in the page, so it
 * shows up as a real download and the gallery stays where it was. The blob version
 * held a large gallery back from Downloads until it had all arrived, and on a phone
 * the tab could die first, so the button looked like it did nothing.
 */
test("both zip buttons produce a download and leave the gallery in place", async ({ page }) => {
  await page.goto(PROJECT);

  const [all] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download all · / }).click(),
  ]);
  expect(all.suggestedFilename()).toMatch(/\.zip$/);
  await all.cancel();
  await expect(page).toHaveURL(new RegExp(`${PROJECT}$`));

  await page.getByRole("checkbox", { name: /^Select / }).first().click();
  const [some] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download 1 · \d/ }).click(),
  ]);
  expect(some.suggestedFilename()).toMatch(/\.zip$/);
  await some.cancel();
  await expect(page).toHaveURL(new RegExp(`${PROJECT}$`));
});
