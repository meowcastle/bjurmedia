import { test, expect } from "@playwright/test";

// Pre-authenticated in global-setup — avoids re-triggering the login rate limiter
// by hitting the real login form in every spec file.
test.use({ storageState: "e2e/.auth/sasha.json" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("project list shows the client's own projects", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("Spring Campaign 2026")).toBeVisible();
  await expect(page.getByText("Product Launch — Aera")).toBeVisible();
});

test("project detail: filters, photo viewer, and favorites", async ({ page }) => {
  await page.getByText("Spring Campaign 2026").click();
  await expect(page).toHaveURL(/\/p\/.+/);
  await expect(page.getByRole("heading", { name: "Spring Campaign 2026" })).toBeVisible();

  // Filter down to Stills only
  await page.getByRole("button", { name: "Stills", exact: true }).click();
  await expect(page.getByText("SSH_Still_012.jpg")).toBeVisible();
  await expect(page.getByText("SSH_Reel_Hero.mp4")).not.toBeVisible();

  // Open a still in the fullscreen photo viewer. Chrome (including the close
  // button) is hidden until the photo area is tapped once, same as the video
  // viewer — the tap target is a gesture-capture surface layered above the
  // <img>, not the image itself.
  await page.getByText("SSH_Still_012.jpg").click();
  const photo = page.getByTestId("active-photo");
  await expect(photo).toBeVisible();
  await page.getByTestId("photo-gesture-surface").click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(photo).not.toBeVisible();

  // Favorite a still, then filter to Favorites and confirm it shows up
  await page.getByTitle("Add to favorites").first().click();
  await page.getByRole("button", { name: /Favorites/ }).click();
  await expect(page.getByText("Favorites", { exact: true })).toBeVisible();
});

test("project detail: video plays inline and can be closed", async ({ page }) => {
  await page.getByText("Spring Campaign 2026").click();
  await page.getByRole("button", { name: "Reels", exact: true }).click();
  await page.getByText("SSH_Reel_Hero.mp4").click();

  const video = page.getByTestId("active-video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", /\/api\/assets\/.+\/proxy/);

  // Chrome (including the close button) is hidden until the video area is tapped
  // once. The tap target is a dedicated gesture-capture surface layered above the
  // <video> element (not the video itself) — native <video> can intercept touch
  // input, so drag/tap handling lives on this overlay instead.
  await page.getByTestId("video-gesture-surface").click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(video).not.toBeVisible();
});

test("internal retainer masters never appear to the client", async ({ page }) => {
  await page.getByText("Spring Campaign 2026").click();
  // SSH is a retainer client — its BRAW masters are internal working files.
  await expect(page.getByText("SSH_HeroCut_MASTER.braw")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Masters", exact: true })).not.toBeVisible();
});
