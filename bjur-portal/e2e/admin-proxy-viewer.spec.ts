import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

const PROJECT = "/admin/media?project=p1";

async function openPreview(page: import("@playwright/test").Page, nth = 0) {
  const row = page.locator('[data-testid^="asset-row-"]').nth(nth);
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { name: /^Actions for / }).click();
  await row.getByRole("menuitem", { name: "Preview proxy" }).click();
  await expect(page.getByTestId("admin-proxy-viewer")).toBeVisible();
}

/**
 * §10 admin preview. The rail is the point: the facts an admin would otherwise have to
 * go hunting for — whether the proxy is really ready, whether the client can see the
 * file, whether it is scheduled, where the master sits on disk.
 */
test("the rail states proxy, visibility, schedule and master path", async ({ page }) => {
  await page.goto(PROJECT);
  await openPreview(page);

  const viewer = page.getByTestId("admin-proxy-viewer");
  await expect(viewer.getByText("Proxy", { exact: true })).toBeVisible();
  await expect(viewer.getByText("Visible to client")).toBeVisible();
  await expect(viewer.getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(viewer.getByText("Path", { exact: true })).toBeVisible();

  // The download link points at the master, not the proxy.
  await expect(viewer.getByRole("link", { name: /Download master/ })).toHaveAttribute(
    "href",
    /\/api\/assets\/[^/]+\/download$/
  );
});

test("Escape closes the preview", async ({ page }) => {
  await page.goto(PROJECT);
  await openPreview(page);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("admin-proxy-viewer")).toHaveCount(0);
});

test("arrow keys walk the visible list and stop at the ends", async ({ page }) => {
  await page.goto(PROJECT);
  await openPreview(page);

  const counter = page.getByTestId("admin-proxy-viewer").getByText(/^\d+ \/ \d+ · admin preview$/);
  await expect(counter).toHaveText(/^1 \//);

  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText(/^2 \//);

  await page.keyboard.press("ArrowLeft");
  await expect(counter).toHaveText(/^1 \//);

  // Already at the first file — left must not wrap round to the last.
  await page.keyboard.press("ArrowLeft");
  await expect(counter).toHaveText(/^1 \//);
});

test("the arrows walk the filtered list, not the whole project", async ({ page }) => {
  await page.goto(PROJECT);

  // Narrow the table first; the preview should only offer what the table is showing.
  const chip = page.getByRole("button", { name: /Needs week/ });
  await chip.click();
  const shown = await page.locator('[data-testid^="asset-row-"]').count();
  expect(shown).toBeGreaterThan(0);

  await openPreview(page);
  await expect(
    page.getByTestId("admin-proxy-viewer").getByText(new RegExp(`^1 / ${shown} · admin preview$`))
  ).toBeVisible();
});

test("a still previews from its poster rather than an empty frame", async ({ page }) => {
  await page.goto(PROJECT);

  // Find a still: photos get no proxy from proxyGen, only a 960px thumb. The row
  // prints the *format* ("STILL"), not the kind — matching on "PHOTO" here found
  // nothing and skipped the test rather than failing it.
  const rows = page.locator('[data-testid^="asset-row-"]');
  const count = await rows.count();
  let photoIndex = -1;
  for (let i = 0; i < count; i++) {
    if ((await rows.nth(i).getByText("STILL", { exact: true }).count()) > 0) {
      photoIndex = i;
      break;
    }
  }
  // p1 seeds six stills, so this finding nothing means the row markup changed.
  expect(photoIndex).toBeGreaterThanOrEqual(0);

  await openPreview(page, photoIndex);
  const img = page.getByTestId("admin-proxy-viewer").locator("img");
  await expect(img).toBeVisible();
  await expect(page.getByTestId("admin-proxy-viewer").getByText("Stills have no proxy")).toBeVisible();
});

test("a proxy that will not load explains itself instead of showing a dead player", async ({ page }) => {
  // Forced rather than relying on seed state: a master whose encode failed, or whose
  // derived file went missing under the admin, must not present as a black rectangle.
  await page.route("**/api/assets/*/proxy", (route) => route.fulfill({ status: 404 }));

  await page.goto(PROJECT);

  const rows = page.locator('[data-testid^="asset-row-"]');
  const count = await rows.count();
  let videoIndex = -1;
  for (let i = 0; i < count; i++) {
    if ((await rows.nth(i).getByText(/^(REEL|FILM|MASTER)$/).count()) > 0) {
      videoIndex = i;
      break;
    }
  }
  expect(videoIndex).toBeGreaterThanOrEqual(0);

  await openPreview(page, videoIndex);

  const viewer = page.getByTestId("admin-proxy-viewer");
  await expect(viewer.getByText("No proxy to preview")).toBeVisible();
  await expect(viewer.locator("video")).toHaveCount(0);

  // The rail is still useful even when the media is not — that is the point of it.
  await expect(viewer.getByText("Visible to client")).toBeVisible();
  await expect(viewer.getByRole("link", { name: /Download master/ })).toBeVisible();
});

test("the rail says the file is missing rather than reprinting a resolution", async ({ page }) => {
  // The database claiming READY while nothing streams is real drift — a derived file
  // deleted under the app, a half-finished encode. The rail must not keep asserting
  // "1080p H.264" next to a player saying there is no proxy.
  await page.route("**/api/assets/*/proxy", (route) => route.fulfill({ status: 404 }));
  await page.goto(PROJECT);

  const rows = page.locator('[data-testid^="asset-row-"]');
  const count = await rows.count();
  let videoIndex = -1;
  for (let i = 0; i < count; i++) {
    if ((await rows.nth(i).getByText(/^(REEL|FILM|MASTER)$/).count()) > 0) {
      videoIndex = i;
      break;
    }
  }
  expect(videoIndex).toBeGreaterThanOrEqual(0);

  await openPreview(page, videoIndex);
  const viewer = page.getByTestId("admin-proxy-viewer");
  await expect(viewer.getByText("Missing on disk — regenerate")).toBeVisible();
  // And the centre says the same thing rather than "no proxy yet", which would
  // contradict the rail and read as a file that was simply never encoded.
  await expect(viewer.getByText(/the file will not load/)).toBeVisible();
  await expect(viewer.getByText(/H\.264/)).toHaveCount(0);
});
