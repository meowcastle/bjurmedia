import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * The client's side of a payment hold.
 *
 * The refusal path is the one worth driving through a real browser: a held project can
 * turn a download down while its watermarked copy is still encoding, and the sheet used
 * to answer that by navigating the client to a tab full of raw JSON. No worker runs under
 * e2e, so nothing is ever marked here — which makes this the exact state that used to
 * look broken.
 */
test.use({ storageState: "e2e/.auth/sasha.json" });

async function setHold(baseURL: string, paymentHold: boolean) {
  const ctx = await pwRequest.newContext({ baseURL, storageState: "e2e/.auth/admin.json" });
  const res = await ctx.patch("/api/admin/projects/p1", { data: { paymentHold } });
  expect(res.ok(), `could not set paymentHold=${paymentHold}`).toBeTruthy();
  await ctx.dispose();
}

test("a held gallery says why it is marked, and refuses in place", async ({ page, baseURL }) => {
  await setHold(baseURL!, true);

  try {
    await page.goto("/p/p1");

    // The client is told what the mark is before they go looking for a fault — one
    // line now, the same sentence the viewer's download sheet uses.
    await expect(page.getByTestId("hold-line")).toContainText(
      /watermarked 1080p previews until the invoice is settled/i,
    );

    await page.getByText("SSH_Reel_Hero.mp4").click();
    await expect(page.getByTestId("video-gesture-surface")).toBeVisible();
    await page.getByTestId("master-chip").click();

    const download = page.getByTestId("sheet-download");
    // The hold is stated in one quiet line beside the button rather than in its label.
    await expect(page.getByTestId("download-sheet")).toContainText(
      /watermarked 1080p previews until the invoice is settled/i,
    );
    // Still a real link, so save-as and middle-click behave.
    await expect(download).toHaveAttribute("href", /^\/api\/assets\/[^/]+\/download$/);

    await download.click();

    // Refused in place: the message lands in the sheet and the viewer is still up.
    await expect(page.getByTestId("sheet-download-error")).toContainText(/still being prepared/i);
    await expect(page.getByTestId("video-gesture-surface")).toBeVisible();
    await expect(page).toHaveURL(/\/p\/p1$/);
  } finally {
    await setHold(baseURL!, false);
  }
});

test("with no hold there is no mark line and no notice", async ({ page }) => {
  await page.goto("/p/p1");
  await expect(page.getByTestId("hold-line")).toHaveCount(0);

  await page.getByText("SSH_Reel_Hero.mp4").click();
  await page.getByTestId("master-chip").click();
  await expect(page.getByTestId("sheet-download")).toBeVisible();
  await expect(page.getByTestId("download-sheet")).not.toContainText(/watermarked 1080p/i);
});
