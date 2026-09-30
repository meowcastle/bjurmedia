import { test, expect, type Page } from "@playwright/test";

/**
 * LOOKS GOOD, for a draft the client read and had nothing to add to — and its undo,
 * which puts the draft warning back and the "to check" count up again.
 */
test.use({ storageState: "e2e/.auth/studio57.json" });

async function toCheckCount(page: Page) {
  const tab = page.getByRole("button", { name: /Captions to check/i });
  if ((await tab.count()) === 0) return 0;
  const m = (await tab.innerText()).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function line(page: Page, name: string) {
  return page
    .locator('[data-testid^="asset-tile-"]')
    .filter({ hasText: name })
    .locator('[data-testid^="caption-line-"]');
}

test("looks good checks the caption and the count drops", async ({ page }) => {
  await page.goto("/p/p9");
  const before = await toCheckCount(page);
  expect(before).toBeGreaterThan(0);

  await line(page, "WR_Draft_B.mp4").click();
  const panel = page.getByTestId("caption-panel");
  await panel.getByTestId("caption-looks-good").click();
  await expect(panel.getByTestId("caption-pill")).toHaveAttribute("data-state", "CHECKED");
  await expect(page.getByTestId("toast")).toContainText("Marked checked");

  await page.getByRole("button", { name: "Close" }).first().click();
  expect(await toCheckCount(page)).toBe(before - 1);

  await page.reload();
  await expect(line(page, "WR_Draft_B.mp4")).toHaveAttribute("data-state", "CHECKED");
});

test("undo straight after looks good returns the draft", async ({ page }) => {
  await page.goto("/p/p9");
  const before = await toCheckCount(page);
  await line(page, "WR_Draft_C.mp4").click();
  const panel = page.getByTestId("caption-panel");
  await panel.getByTestId("caption-looks-good").click();
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(panel.getByTestId("caption-pill")).toHaveAttribute("data-state", "DRAFT");
  await page.getByRole("button", { name: "Close" }).first().click();
  expect(await toCheckCount(page)).toBe(before);

  await page.reload();
  await expect(line(page, "WR_Draft_C.mp4")).toHaveAttribute("data-state", "DRAFT");
});
