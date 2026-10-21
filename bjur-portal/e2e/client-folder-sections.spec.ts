import { test, expect, type Browser } from "@playwright/test";

const PROJECT = "/p/p1";

async function asAdmin(browser: Browser) {
  const ctx = await browser.newContext({ storageState: "e2e/.auth/admin.json" });
  return { ctx, api: ctx.request };
}

/**
 * A folder is its own section in the client's gallery, under its own name, after the
 * files that aren't in one. It used to be a "Folder:" dropdown that defaulted to All,
 * so clips from the night sat in the same Reels grid as the finished reels.
 */
test("folders render as their own sections after unfiled files", async ({ browser }) => {
  const { ctx, api } = await asAdmin(browser);
  const name = `Clips from the night ${Date.now()}`;
  const made = await api.post(`/api/admin/projects/p1/folders`, { data: { name } });
  expect(made.ok()).toBeTruthy();
  const { folder } = await made.json();

  const client = await browser.newContext({ storageState: "e2e/.auth/sasha.json" });
  const page = await client.newPage();
  try {
    await page.goto(PROJECT);
    const tile = page.locator('[data-testid^="asset-tile-"]', { hasText: "SSH_Reel_BTS" });
    const assetId = (await tile.getAttribute("data-testid"))!.replace("asset-tile-", "");
    const moved = await api.patch(`/api/admin/assets/bulk-folder`, {
      data: { assetIds: [assetId], folderId: folder.id },
    });
    expect(moved.ok()).toBeTruthy();

    await page.reload();
    const headings = page.locator("span.font-extrabold.text-\\[15px\\]");
    await expect(headings.filter({ hasText: name })).toHaveCount(1);
    // The unfiled reels keep the plain heading and come first; the dropdown is gone.
    const labels = await headings.allTextContents();
    expect(labels.indexOf("Reels")).toBeLessThan(labels.indexOf(name));
    await expect(page.getByRole("combobox")).toHaveCount(0);

    // The folder's section holds that reel, and the Reels section no longer does.
    const section = page.locator("div.mb-9", { has: page.getByText(name, { exact: true }) });
    await expect(section.getByText("SSH_Reel_BTS")).toHaveCount(1);
  } finally {
    await api.delete(`/api/admin/folders/${folder.id}`);
    await client.close();
    await ctx.close();
  }
});
