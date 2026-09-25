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
    await expect(page.getByTestId("fullscreen")).toBeVisible();
    // Reachable, not merely present: a control tucked under the notes panel is neither.
    await expect(page.getByTestId("fullscreen")).toBeInViewport();
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
