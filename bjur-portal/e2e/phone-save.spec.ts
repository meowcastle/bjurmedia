import { test, expect } from "@playwright/test";

/**
 * On a phone a selection saves two ways: straight into Photos through the share sheet,
 * or as one zip into Files. A zip alone was the only option, and on an iPhone a zip
 * lands in Downloads with nothing in the camera roll.
 *
 * The share sheet is stubbed: headless Chromium has none, and what matters here is which
 * files the page hands to it.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: "e2e/.auth/sasha.json",
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { name: string; type: string; size: number }[] | null };
    w.__shared = null;
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { files?: File[] }) => {
        w.__shared = (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size }));
      },
    });
  });
});

const shared = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __shared: { name: string; type: string; size: number }[] | null }).__shared);

test("a selection goes to Photos as real files, in two taps", async ({ page }) => {
  // The seed's reels have no preview encode on disk (the next test relies on that), so
  // the previews are served here. What is under test is the page: what it fetches, what
  // it names the files, and what it hands the share sheet.
  await page.route(/\/api\/assets\/[^/]+\/proxy\?download=1$/, (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.alloc(64 * 1024, 1) })
  );
  await page.goto("/p/p1");
  const boxes = page.getByRole("checkbox", { name: /^Select .*\.mp4$/i });
  await boxes.nth(0).click();
  await boxes.nth(1).click();

  const photos = page.getByTestId("save-to-photos");
  await expect(photos).toHaveText("Save to Photos");
  await expect(page.getByTestId("save-to-files")).toBeVisible();

  await photos.click();
  await expect(photos).toHaveText(/^Add \d to Photos$/, { timeout: 30_000 });
  await photos.click();
  await expect(photos).toHaveText("Saved");

  const files = await shared(page);
  expect(files).toHaveLength(2);
  for (const f of files!) {
    expect(f.size).toBeGreaterThan(0);
    expect(f.type).toBe("video/mp4");
    expect(f.name).toMatch(/\.mp4$/);
  }
});

test("files with nothing to save yet say so instead of saving nothing", async ({ page }) => {
  await page.goto("/p/p1");
  const reels = page.getByRole("checkbox", { name: /^Select .*\.mp4$/i });
  await reels.nth(0).click();
  await page.getByTestId("save-to-photos").click();
  await expect(page.getByTestId("phone-save-error")).toContainText("ready yet");
  expect(await shared(page)).toBeNull();
});

test("Save to Files is the zip", async ({ page }) => {
  await page.goto("/p/p1");
  await page.getByRole("checkbox", { name: /^Select / }).first().click();
  const [zip] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("save-to-files").click(),
  ]);
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  await zip.cancel();
});

test("Download all on a phone offers the same two choices for everything", async ({ page }) => {
  await page.goto("/p/p1");
  await page.getByRole("button", { name: /Download all · / }).click();
  await expect(page.getByTestId("phone-save")).toBeVisible();
  await expect(page.getByText(/^\d+ selected$/)).toBeVisible();
});

test("a laptop keeps the single zip button", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: "e2e/.auth/sasha.json" });
  const page = await ctx.newPage();
  await page.goto("/p/p1");
  await page.getByRole("checkbox", { name: /^Select / }).first().click();
  await expect(page.getByTestId("phone-save")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Download 1 · \d/ })).toBeVisible();
  await ctx.close();
});
