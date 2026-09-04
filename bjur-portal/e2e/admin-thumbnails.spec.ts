import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * §10. The proxy pipeline writes a poster to Asset.thumbRelPath and the client gallery
 * has always rendered it. The admin table drew a gradient placeholder instead, so the
 * one screen whose job is identifying a file was the only one that never showed it.
 */
test("rows with a generated poster render it, not just a gradient", async ({ page }) => {
  await page.goto("/admin/media?project=p1");

  const thumbs = page.locator('[data-testid^="asset-row-"] img[src*="/thumb"]');
  expect(await thumbs.count()).toBeGreaterThan(0);

  // And it actually decoded — a broken src still yields an <img> in the DOM.
  const loaded = await thumbs.first().evaluate((el) => {
    const img = el as HTMLImageElement;
    return img.complete && img.naturalWidth > 0;
  });
  expect(loaded).toBe(true);
});

test("the poster request is served, not 404", async ({ page }) => {
  const statuses: number[] = [];
  page.on("response", (r) => {
    if (/\/api\/assets\/[^/]+\/thumb/.test(r.url())) statuses.push(r.status());
  });

  await page.goto("/admin/media?project=p1");
  await expect(page.locator('[data-testid^="asset-row-"] img[src*="/thumb"]').first()).toBeVisible();

  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.filter((s) => s >= 400)).toEqual([]);
});
