import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * §10c. Which delivered files are actually performing — the question a retainer
 * conversation opens with. 57.NYC is the seeded client with an Instagram account and
 * posts against its IG Posting deliverables.
 */
async function gotoClient(page: import("@playwright/test").Page, name: string) {
  await page.goto("/admin/clients");
  await page.getByText(name, { exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/.+/);
}

test("top posts are listed highest-viewed first", async ({ page }) => {
  await gotoClient(page, "57.NYC");

  const panel = page.getByTestId("top-posts");
  await expect(panel).toBeVisible();

  const counts = await panel.getByText(/^[\d,]+$/).allTextContents();
  expect(counts.length).toBeGreaterThan(1);

  const numbers = counts.map((t) => Number(t.replace(/,/g, "")));
  // Strictly descending — an unordered "top posts" list is just a list.
  expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  expect(numbers[0]).toBeGreaterThan(0);
});

test("each post names the delivered file and links out to the post", async ({ page }) => {
  await gotoClient(page, "57.NYC");
  const panel = page.getByTestId("top-posts");

  // The asset name is what an admin recognises, not the caption.
  await expect(panel.getByText(/IG_Jul\d+_/).first()).toBeVisible();

  const link = panel.getByRole("link").first();
  await expect(link).toHaveAttribute("href", /^https:\/\/www\.instagram\.com\//);
  await expect(link).toHaveAttribute("target", "_blank");
});

test("a client with no connected account shows no top-posts section at all", async ({ page }) => {
  // Halcyon Films is seeded without a social account — an empty panel headed "Top
  // posts" would read as "nothing is performing" rather than "nothing is connected".
  await gotoClient(page, "Halcyon Films");
  await expect(page.getByTestId("top-posts")).toHaveCount(0);
});
