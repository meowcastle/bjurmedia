import { test, expect } from "@playwright/test";

/**
 * The review screen on a phone.
 *
 * It was built desktop-first, and the column layout that mobile falls back to gave the
 * notes list all the height and the player none — the video collapsed to a 300x150 stub
 * and the transport overlapped the "Notes" heading. A review screen whose one job is
 * watching the cut.
 */
test.use({ storageState: "e2e/.auth/sasha.json", viewport: { width: 390, height: 844 } });

test("the player gets real height on a phone", async ({ page }) => {
  await page.goto("/p/p2/review");
  await expect(page.getByTestId("review-screen")).toBeVisible();

  const player = await page.getByTestId("player-area").boundingBox();
  expect(player, "player area should exist").toBeTruthy();
  // At least a third of the viewport. It used to get about 18%.
  expect(player!.height).toBeGreaterThan(844 * 0.33);

  // The transport sits below the player rather than on top of what follows it.
  const transport = await page.getByTestId("play").boundingBox();
  expect(transport!.y).toBeGreaterThan(player!.y + player!.height - 4);
});

test("everything stays reachable and nothing spills sideways", async ({ page }) => {
  await page.goto("/p/p2/review");
  await page.getByTestId("review-screen").waitFor();

  for (const id of ["cut-tabs", "play", "scrubber", "composer", "send-notes"]) {
    await expect(page.getByTestId(id).first(), id).toBeVisible();
  }
  const spills = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(spills, "no horizontal scroll at 390px").toBe(false);
});

test("the composer does not trigger an iOS zoom", async ({ page }) => {
  await page.goto("/p/p2/review");
  // Safari zooms the whole page when a focused input is under 16px. On a review screen
  // that means the video jumps out of frame the moment you start typing a note.
  const size = await page
    .getByTestId("composer")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});
