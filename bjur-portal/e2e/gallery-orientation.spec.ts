import { test, expect } from "@playwright/test";

/**
 * Wide vs vertical in the client gallery.
 *
 * The control is deliberately conditional. Ingest derives a video's format from its
 * shape — portrait becomes a Reel, landscape a Film — so on those tabs an orientation
 * filter would be a duplicate of the tab beside it and could only ever select all or
 * nothing. Stills are the case it exists for. These tests pin that it appears exactly
 * where it divides something and nowhere else.
 */
test.use({ storageState: "e2e/.auth/sasha.json" });

test("it sorts wide from vertical within stills", async ({ page }) => {
  await page.goto("/p/p1");

  const control = page.getByTestId("orientation-filter");
  await page.getByRole("button", { name: /^Stills/ }).click();
  await expect(control).toBeVisible();

  // Assert the invariant rather than a seed constant: whatever number the pill claims is
  // the number of tiles that survive choosing it, and the two halves add up to the whole.
  // Hard-coding the seed's counts here would just break the next time it is edited.
  const countOn = async (id: string) =>
    parseInt((await page.getByTestId(id).innerText()).match(/\d+/)?.[0] ?? "0", 10);

  const wide = await countOn("orientation-landscape");
  const vertical = await countOn("orientation-portrait");
  const all = await countOn("orientation-ALL");
  expect(wide).toBeGreaterThan(0);
  expect(vertical).toBeGreaterThan(0);
  expect(wide + vertical).toBe(all);

  const tiles = page.locator('[data-testid^="asset-tile-"]');
  await expect(tiles).toHaveCount(all);

  await page.getByTestId("orientation-portrait").click();
  await expect(tiles).toHaveCount(vertical);

  await page.getByTestId("orientation-landscape").click();
  await expect(tiles).toHaveCount(wide);

  await page.getByTestId("orientation-ALL").click();
  await expect(tiles).toHaveCount(all);
});

test("it stays out of the way where the format already says the shape", async ({ page }) => {
  await page.goto("/p/p1");

  // Every Reel is portrait by construction, so the control would select all or nothing.
  await page.getByRole("button", { name: /^Reels/ }).click();
  await expect(page.getByTestId("orientation-filter")).toHaveCount(0);

  // Same for Films, which are landscape by construction.
  await page.getByRole("button", { name: /^Films/ }).click();
  await expect(page.getByTestId("orientation-filter")).toHaveCount(0);
});

test("choosing vertical then a format that has none does not silently filter", async ({ page }) => {
  await page.goto("/p/p1");

  await page.getByRole("button", { name: /^Stills/ }).click();
  const tiles = page.locator('[data-testid^="asset-tile-"]');
  const vertical = parseInt(
    (await page.getByTestId("orientation-portrait").innerText()).match(/\d+/)?.[0] ?? "0",
    10,
  );
  await page.getByTestId("orientation-portrait").click();
  await expect(tiles).toHaveCount(vertical);

  // Reels are all portrait, so the control disappears — and must stop applying with it,
  // rather than quietly filtering behind a control that is no longer on screen. Every
  // reel should still be on screen, not just the ones a stale filter would have kept.
  await page.getByRole("button", { name: /^Reels/ }).click();
  await expect(page.getByTestId("orientation-filter")).toHaveCount(0);
  const reelCount = parseInt(
    (await page.getByRole("button", { name: /^Reels/ }).innerText()).match(/\d+/)?.[0] ?? "0",
    10,
  );
  expect(reelCount).toBeGreaterThan(0);
  await expect(tiles).toHaveCount(reelCount);
});
