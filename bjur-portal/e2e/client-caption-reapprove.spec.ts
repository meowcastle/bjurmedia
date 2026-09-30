import { test, expect, type Browser } from "@playwright/test";

/**
 * A client changing a caption staff already approved takes the approval away, so the
 * edited copy cannot go out unread — and the board says who changed it.
 */
async function asPage(browser: Browser, state: string) {
  const ctx = await browser.newContext({ storageState: state });
  return { ctx, page: await ctx.newPage() };
}

async function reelId(browser: Browser, name: string) {
  const { ctx, page } = await asPage(browser, "e2e/.auth/studio57.json");
  await page.goto("/p/p9");
  const testid = await page
    .locator('[data-testid^="asset-tile-"]')
    .filter({ hasText: name })
    .getAttribute("data-testid");
  await ctx.close();
  return testid!.replace("asset-tile-", "");
}

test("a client edit clears staff approval and marks the board card", async ({ browser }) => {
  const id = await reelId(browser, "WR_Checked.mp4");
  const admin = await asPage(browser, "e2e/.auth/admin.json");
  const client = await asPage(browser, "e2e/.auth/studio57.json");

  expect((await admin.page.request.post(`/api/admin/assets/${id}/approve-caption`)).ok()).toBeTruthy();

  const edit = await client.page.request.patch(`/api/assets/${id}/copy`, {
    data: { caption: `Client changed it ${Date.now()}` },
  });
  expect(edit.ok()).toBeTruthy();
  expect((await edit.json()).captionEditedBy).toBe("CLIENT");

  // Today's item lands on the board with this card open, on its week.
  await admin.page.goto(`/admin/media?project=p9&asset=${id}`);
  const card = admin.page.getByTestId(`client-edited-${id}`).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Edited by client/i);
  await expect(admin.page.getByText("Needs review").first()).toBeVisible();

  await admin.ctx.close();
  await client.ctx.close();
});

test("staff saving copy through the same route is recorded as staff", async ({ browser }) => {
  const id = await reelId(browser, "WR_Draft_A.mp4");
  const admin = await asPage(browser, "e2e/.auth/admin.json");
  const res = await admin.page.request.patch(`/api/assets/${id}/copy`, { data: { contentTitle: "Staff title" } });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).captionEditedBy).toBe("ADMIN");
  await admin.ctx.close();
});
