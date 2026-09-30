import { test, expect } from "@playwright/test";

/** Once a week is in Slack its captions are fixed: read-only in the viewer, 409 at the route. */
test.use({ storageState: "e2e/.auth/studio57.json" });

test("a posted reel's caption is read-only and the route refuses it", async ({ page }) => {
  await page.goto("/p/p9");
  const card = page.locator('[data-testid^="asset-tile-"]').filter({ hasText: "WR_Posted.mp4" });
  const line = card.locator('[data-testid^="caption-line-"]');
  await expect(line).toHaveAttribute("data-state", "POSTED");
  const id = (await line.getAttribute("data-testid"))!.replace("caption-line-", "");

  await line.click();
  const panel = page.getByTestId("caption-panel");
  await expect(panel.getByTestId("caption-pill")).toHaveAttribute("data-state", "POSTED");
  await expect(panel.getByTestId("caption-ig")).toHaveAttribute("readonly", "");
  await expect(panel.getByTestId("caption-title")).toHaveAttribute("readonly", "");
  await expect(panel.getByText(/Ask in #57-social to change it/)).toBeVisible();

  const res = await page.request.patch(`/api/assets/${id}/copy`, { data: { caption: "sneaking in" } });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe("posted");
});

test("a reel with no speech invites the client to write one", async ({ page }) => {
  await page.goto("/p/p9");
  const card = page.locator('[data-testid^="asset-tile-"]').filter({ hasText: "WR_NoSpeech.mp4" });
  await expect(card.locator('[data-testid^="caption-line-"]')).toHaveAttribute("data-state", "NO_SPEECH");
  await card.locator('[data-testid^="caption-line-"]').click();
  await expect(page.getByTestId("caption-panel").getByTestId("caption-ig")).toHaveAttribute(
    "placeholder",
    "Write a caption",
  );
});
