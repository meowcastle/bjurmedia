import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * Done saves each upload's date, then closes. It used to wait on every save with
 * Promise.all, so one request that never answered left a Done button that did nothing.
 *
 * The local e2e server has no worker to ingest into, so the upload's answer is supplied
 * here, and the date save is held open to stand in for a NAS too busy to reply.
 */
test("Done closes the upload dialog even when a date save never answers", async ({ page }) => {
  await page.route(/\/api\/admin\/projects\/[^/]+\/upload$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ingested: true, assetId: "hung-asset", capturedAt: "2026-10-16T12:00:00Z" }),
    })
  );
  // Never fulfilled: the save hangs for as long as the page lives.
  await page.route("**/api/admin/assets/hung-asset", () => {});

  // Media is reached from a project; there is no picker of its own any more.
  await page.goto("/admin/media?project=p1");
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Upload files")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(1024, 1),
  });
  await page.getByRole("button", { name: /Upload 1/ }).click();

  const done = page.getByRole("button", { name: "Done" });
  await expect(done).toBeVisible();
  await done.click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeVisible();
  await expect(page.getByText("Upload files")).toHaveCount(0, { timeout: 12_000 });
});
