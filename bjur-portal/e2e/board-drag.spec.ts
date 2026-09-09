import { test, expect } from "@playwright/test";

/**
 * Dragging an unscheduled file onto a day.
 *
 * Drag is added alongside the per-day picker, not instead of it: HTML5 drag does not
 * work on touch, and the board has to stay usable on a phone.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

async function openCalendar(page: import("@playwright/test").Page) {
  await page.goto("/admin/media?project=p8");
  await page.getByRole("button", { name: /Calendar/i }).first().click();
}

test("the tray lists what has no day yet and says how to place it", async ({ page }) => {
  await openCalendar(page);
  const tray = page.getByTestId("unscheduled-tray");
  await expect(tray).toBeVisible();
  await expect(tray).toContainText(/Drag onto a day, or use \+ schedule/);
  expect(await page.getByTestId("tray-card").count()).toBeGreaterThan(0);
});

test("dropping a card on a day schedules it there", async ({ page }) => {
  await openCalendar(page);

  const card = page.getByTestId("tray-card").first();
  const assetId = await card.getAttribute("data-asset-id");
  expect(assetId).toBeTruthy();
  const before = await page.getByTestId("tray-card").count();

  // Find an empty day to drop onto.
  const day = page.locator("[data-day]").filter({ hasText: "+ schedule" }).first();
  const dayKey = await day.getAttribute("data-day");

  // HTML5 drag-and-drop does not run off synthesised mouse movement, so Playwright's
  // dragTo() moves the pointer and nothing happens. Dispatching the real drag events
  // with one shared DataTransfer is what the browser itself does, and it is what
  // exercises the handlers under test.
  // The drop schedules optimistically and PATCHes behind it; reloading before that
  // lands reads the old state back and looks exactly like a drop that did nothing.
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/admin/assets/") && r.request().method() === "PATCH",
  );
  await page.evaluate(
    ({ assetId, dayKey }) => {
      const src = document.querySelector(`[data-asset-id="${assetId}"]`)!;
      const target = document.querySelector(`[data-day="${dayKey}"]`)!;
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
      target.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { assetId, dayKey },
  );

  await saved;

  // The card leaves the tray and the day now holds it.
  await expect(page.getByTestId("tray-card")).toHaveCount(before - 1);
  await expect(page.locator(`[data-day="${dayKey}"]`).getByTestId("calendar-card")).toBeVisible();

  // And it is real: a reload asks the server, not the component's own state.
  await page.reload();
  await page.getByRole("button", { name: /Calendar/i }).first().click();
  await expect(
    page.locator(`[data-day="${dayKey}"]`).getByTestId("calendar-card"),
  ).toBeVisible();

  // Put it back so the rest of the suite sees the board it expects.
  await page.locator(`[data-day="${dayKey}"]`).getByTestId("calendar-card").click();
  await page.getByRole("button", { name: "Unschedule", exact: true }).click();
  await expect(page.getByTestId("tray-card")).toHaveCount(before);
});

test("the picker still works, for touch", async ({ page }) => {
  await openCalendar(page);
  const day = page.locator("[data-day]").filter({ hasText: "+ schedule" }).first();
  await day.getByRole("button", { name: "+ schedule" }).click();
  await expect(day.getByText(/No unscheduled files|\.mp4|\.mov/).first()).toBeVisible();
});
