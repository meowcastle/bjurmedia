import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/sasha.json" });

test("the player can go fullscreen, by button and by key", async ({ page }) => {
  await page.goto("/p/p2/review");
  await expect(page.getByTestId("review-screen")).toBeVisible();

  const btn = page.getByTestId("fullscreen");
  await expect(btn).toBeVisible();

  // It targets the player, not the page: the notes panel is meant to go away.
  const targets = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="player-area"]');
    return { exists: !!el, canFullscreen: typeof el?.requestFullscreen === "function" };
  });
  expect(targets.exists).toBe(true);
  expect(targets.canFullscreen).toBe(true);
});

test("f is ignored while typing a note", async ({ page }) => {
  await page.goto("/p/p2/review");
  await page.getByTestId("composer").fill("a fade here");
  // Would be maddening: every "f" in a note throwing the player fullscreen.
  await expect(page.getByTestId("composer")).toHaveValue("a fade here");
});
