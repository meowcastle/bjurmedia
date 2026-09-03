import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/sasha.json" });

/**
 * §2: search and sort over the client's deliveries, and cards that state a size and a
 * new-file count instead of a "LIVE" kicker that was true of every project in the list.
 */
test("search filters the list and says so when nothing matches", async ({ page }) => {
  await page.goto("/");

  const search = page.getByLabel("Search projects");
  await expect(search).toBeVisible();

  await expect(page.getByText("Spring Campaign 2026")).toBeVisible();

  await search.fill("spring");
  await expect(page.getByText("Spring Campaign 2026")).toBeVisible();

  await search.fill("nothingmatchesthis");
  await expect(page.getByText(/No projects match/)).toBeVisible();
  await expect(page.getByText("Spring Campaign 2026")).toHaveCount(0);

  // Clearing restores the full list rather than leaving the empty state stuck.
  await search.fill("");
  await expect(page.getByText("Spring Campaign 2026")).toBeVisible();
});

test("A–Z reorders the cards and Newest puts them back", async ({ page }) => {
  await page.goto("/");

  const titles = () => page.locator("a[href^='/p/'] .text-xl").allTextContents();
  const byNewest = await titles();
  test.skip(byNewest.length < 2, "needs at least two projects to reorder");

  await page.getByRole("button", { name: "A–Z" }).click();
  const az = await titles();
  expect(az).toEqual([...byNewest].sort((a, b) => a.localeCompare(b)));

  await page.getByRole("button", { name: "Newest" }).click();
  expect(await titles()).toEqual(byNewest);
});

test("cards state a size and drop the LIVE kicker", async ({ page }) => {
  await page.goto("/");

  const card = page.locator("a[href^='/p/']").first();
  // A real size, not NaN — the per-project byte sum crossed the RSC boundary as a
  // string because BigInt cannot.
  await expect(card).toContainText(/\d+(\.\d+)? (MB|GB)/);
  await expect(card).toContainText("Open →");
  await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);
});
