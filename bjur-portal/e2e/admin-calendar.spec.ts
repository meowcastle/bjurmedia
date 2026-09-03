import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// p8 = 57.NYC "IG Posting", the project the weekly content calendar exists for.
const PROJECT = "/admin/media?project=p8";

const heading = (p: Page) => p.getByText(/^Week of /);
const cards = (p: Page) => p.locator("button").filter({ hasText: /Needs title|Needs caption|Ready/ });

async function openCalendar(page: Page) {
  await page.goto(PROJECT);
  await page.getByRole("button", { name: "calendar", exact: true }).click();
  await expect(heading(page)).toBeVisible();
}

/**
 * The seed schedules p8's assets on fixed dates, so which week holds them depends on
 * when the suite runs. Walk backwards to find them rather than hard-coding a week that
 * silently stops matching — a test that skips itself is no better than one that passes
 * vacuously.
 */
async function goToWeekWithACard(page: Page) {
  for (let i = 0; i < 20; i++) {
    if ((await cards(page).count()) > 0) return true;
    await page.getByRole("button", { name: "Previous week" }).click();
  }
  return (await cards(page).count()) > 0;
}

test("switches to the calendar and back", async ({ page }) => {
  await openCalendar(page);
  await expect(page.getByText("Slack post preview")).toBeVisible();

  await page.getByRole("button", { name: "files", exact: true }).click();
  await expect(page.getByText("Slack post preview")).toHaveCount(0);
});

test("week navigation moves a week at a time and Today returns", async ({ page }) => {
  await openCalendar(page);
  const first = await heading(page).textContent();

  await page.getByRole("button", { name: "Next week" }).click();
  expect(await heading(page).textContent()).not.toBe(first);

  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(heading(page)).toHaveText(first!);

  await page.getByRole("button", { name: "Next week" }).click();
  await page.getByRole("button", { name: "Next week" }).click();
  expect(await heading(page).textContent()).not.toBe(first);
  await page.getByRole("button", { name: "Today" }).click();
  await expect(heading(page)).toHaveText(first!);
});

test("a title typed in the drawer reaches the Slack preview", async ({ page }) => {
  await openCalendar(page);
  expect(await goToWeekWithACard(page), "seed should schedule something").toBe(true);

  await cards(page).first().click();
  const title = page.getByPlaceholder("TOVA (FAM ONLY)");
  await expect(title).toBeVisible();

  const marker = `E2E MARKER ${Date.now()}`;
  await title.fill(marker);
  await page.getByRole("button", { name: "Save" }).click();

  // The preview comes from the same buildWeeklySlackPost() the worker posts with, so
  // seeing the edit here is what says it would reach Slack.
  await expect(page.locator("pre")).toContainText(marker.toUpperCase());
});

test("rescheduling lands a file on the exact day clicked, not the Monday", async ({ page }) => {
  await openCalendar(page);
  expect(await goToWeekWithACard(page), "seed should schedule something").toBe(true);

  // The LAST day with a free slot, deliberately. A regression that wrote the Monday of
  // the week rather than the day clicked would still look right if the test always
  // picked Monday, so the assertion has to land somewhere Monday isn't.
  const targetCell = page
    .locator("[data-day]")
    .filter({ has: page.getByRole("button", { name: "+ schedule" }) })
    .last();
  const targetDay = await targetCell.getAttribute("data-day");
  expect(targetDay).toBeTruthy();
  expect(targetDay).not.toBe(await page.locator("[data-day]").first().getAttribute("data-day"));

  // Free a file up so the picker has something to offer.
  await cards(page).first().click();
  await page.getByRole("button", { name: "Unschedule" }).click();

  await targetCell.getByRole("button", { name: "+ schedule" }).click();
  const pick = targetCell.locator("button").filter({ hasText: /\.(mp4|mov|jpg|png)/i }).first();
  await expect(pick).toBeVisible();
  // The picker button stacks name then format; take just the name.
  const filename = (await pick.locator("div").first().textContent())!.trim();
  await pick.click();

  // It must be in the cell whose data-day we clicked, not merely somewhere on screen.
  await expect(page.locator(`[data-day="${targetDay}"]`)).toContainText(filename);
});
