import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import crypto from "crypto";

// The client-facing upload page, not the admin dialog.
test.use({ storageState: "e2e/.auth/sasha.json" });

const UPLOAD = "/p/p1/upload";

let tmpDir: string;
test.beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "bjur-upload-ui-"));
});
test.afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function fixture(name: string, bytes: number) {
  const p = path.join(tmpDir, name);
  writeFileSync(p, crypto.randomBytes(bytes));
  return p;
}

/**
 * §6: the summary card. A client sending 300GB watches this and nothing else, so it
 * has to state what is happening in their terms — how many files, how many bytes, and
 * whether it is still moving — rather than a row of percentages.
 */
test("the summary card states file count and total size before uploading", async ({ page }) => {
  await page.goto(UPLOAD);

  await page.locator('input[type="file"]').first().setInputFiles([
    fixture("a.mp4", 2 * 1024 * 1024),
    fixture("b.mp4", 3 * 1024 * 1024),
  ]);

  await expect(page.getByText("0 of 2 files")).toBeVisible();
  // 5 MB total, stated as bytes rather than a percentage of nothing.
  await expect(page.getByText(/0 MB of 5 MB/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Upload 2/ })).toBeVisible();
});

test("queue rows show size and a per-file state", async ({ page }) => {
  await page.goto(UPLOAD);
  await page.locator('input[type="file"]').first().setInputFiles([fixture("solo.mp4", 1024 * 1024)]);

  const row = page.locator("text=solo.mp4").first();
  await expect(row).toBeVisible();
  await expect(page.getByText("Queued")).toBeVisible();
  await expect(page.getByText(/^1 MB$/)).toBeVisible();
});

test("a completed upload offers the way back to the project", async ({ page }) => {
  await page.goto(UPLOAD);
  await page.locator('input[type="file"]').first().setInputFiles([fixture("tiny.mp4", 64 * 1024)]);

  await page.getByRole("button", { name: /Upload 1/ }).click();

  // Small enough to finish in one chunk; the card should flip to a terminal state and
  // stop offering an upload button that has nothing left to do.
  await expect(page.getByText("1 of 1 files")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Back to project" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Upload \d/ })).toHaveCount(0);
});
