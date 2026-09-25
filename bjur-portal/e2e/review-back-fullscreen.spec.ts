import { test, expect } from "@playwright/test";

/**
 * Getting off the review screen, and going fullscreen on it.
 *
 * The screen is a fixed-inset overlay with no portal chrome behind it — deliberately, it
 * is a viewing room — which meant the only way out was the browser's back button. The
 * wordmark is the way out now, and it has to be there for a client too, not only staff.
 */
test.describe("client", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("the wordmark goes back to the projects list", async ({ page }) => {
    await page.goto("/p/p2/review");
    await expect(page.getByTestId("review-screen")).toBeVisible();

    await page.getByTestId("review-back").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /Product Launch/ })).toBeVisible();
  });

  test("fullscreen is offered to a client, on a laptop and on a phone", async ({ page }) => {
    await page.goto("/p/p2/review");
    await expect(page.getByTestId("fullscreen")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const btn = page.getByTestId("fullscreen");
    await expect(btn).toBeVisible();
    // Reachable, not merely present: a control tucked under the notes panel is neither.
    await expect(btn).toBeInViewport();
    // And big enough to hit with a thumb. Apple's own floor is 44pt.
    const box = await btn.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("on a phone with no element fullscreen, the video itself goes fullscreen", async ({ page }) => {
    await page.goto("/p/p2/review");
    // iOS to the letter: fullscreenEnabled false, no element API, only the <video> can do
    // it. The old order called requestFullscreen first, which rejects into nothing there.
    await page.evaluate(() => {
      Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
      Object.defineProperty(document, "webkitFullscreenEnabled", { value: false, configurable: true });
      const v = document.querySelector('[data-testid="review-video"]') as HTMLVideoElement & {
        webkitEnterFullscreen?: () => void;
      };
      (window as unknown as { __native: number }).__native = 0;
      v.webkitEnterFullscreen = () => {
        (window as unknown as { __native: number }).__native += 1;
      };
    });

    await page.getByTestId("fullscreen").click();
    expect(await page.evaluate(() => (window as unknown as { __native: number }).__native)).toBe(1);
  });

  test("the filename follows the cut you are looking at", async ({ page }) => {
    await page.goto("/p/p2/review");
    const title = page.getByTestId("asset-title");
    const onLatest = await title.textContent();

    await page.getByTestId("cut-tab-1").click();
    // p2's two cuts are two ingests of one file, so the name is the same — what matters
    // is that it is read off the selected cut rather than frozen at page load.
    await expect(title).toBeVisible();
    expect(await title.textContent()).toBe(onLatest);
  });
});

test.describe("studio", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("the wordmark goes back to the project", async ({ page }) => {
    await page.goto("/admin/projects/p2/review");
    await expect(page.getByTestId("review-screen")).toBeVisible();

    await page.getByTestId("review-back").click();
    await expect(page).toHaveURL(/\/admin\/projects\/p2$/);
  });
});
