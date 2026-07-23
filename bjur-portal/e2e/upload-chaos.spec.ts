import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import crypto from "crypto";

test.use({ storageState: "e2e/.auth/admin.json" });

// Regression coverage for the silent-truncation bug: Next.js's "proxy" body-buffering
// (triggered by middleware.ts matching every route, including this upload API) capped
// request bodies at 10MB with no error thrown, well before the file ever reached
// ingestFile(). Every fixture here is sized comfortably past that old default so a
// reintroduction of the bug (e.g. middleware's matcher creeping back to include /api)
// fails these tests immediately instead of surfacing as a mystery weeks later.
const LARGE_FIXTURE_BYTES = 15 * 1024 * 1024; // 15MB — safely past the old 10MB cap

let tmpDir: string;

test.beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "bjur-upload-chaos-"));
});

test.afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeFixture(name: string, sizeBytes: number) {
  const filePath = path.join(tmpDir, name);
  writeFileSync(filePath, crypto.randomBytes(sizeBytes));
  return filePath;
}

async function openUploadDialog(page: import("@playwright/test").Page) {
  await page.goto("/admin/media");
  await page.getByRole("combobox").selectOption({ label: "SSH — Spring Campaign 2026" });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Upload deliverables")).toBeVisible();
}

test("large upload (15MB) completes without silent truncation", async ({ page }) => {
  const file = makeFixture("large.mp4", LARGE_FIXTURE_BYTES);
  await openUploadDialog(page);

  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("1 file queued")).toBeVisible();

  await page.getByRole("button", { name: /Upload 1/ }).click();

  // The worker container isn't reachable from the local e2e dev server, so a real
  // upload here can never reach "ingested: true" — but it must get far enough to
  // attempt the ingest call at all, which only happens after the byte-count check
  // passes. "Upload incomplete" (the truncation error) or "Upload failed" (a stream
  // error) must never appear; "couldn't reach the ingest service" is the expected,
  // benign outcome in this environment and proves the full 15MB round-tripped intact.
  await expect(page.getByText(/upload incomplete/i)).not.toBeVisible();
  await expect(page.getByText(/upload failed/i)).not.toBeVisible();
  await expect(page.getByText(/couldn't reach the ingest service/i)).toBeVisible({
    timeout: 15_000,
  });
});

test("selecting the same file twice de-dupes instead of double-queuing", async ({ page }) => {
  const file = makeFixture("dupe.mp4", 1024 * 1024);
  await openUploadDialog(page);

  const input = page.locator('input[type="file"]');
  await input.setInputFiles(file);
  await expect(page.getByText("1 file queued")).toBeVisible();

  // Re-picking the identical path a second time should be recognized as the same
  // name+size and skipped, not appended as a second queue entry.
  await input.setInputFiles(file);
  await expect(page.getByText("1 file queued")).toBeVisible();
  await expect(page.getByText(/^2 files? queued/)).not.toBeVisible();
});

test("concurrent multi-file batch: each file completes independently, no cross-contamination", async ({
  page,
}) => {
  const fileA = makeFixture("batch-a.mp4", 2 * 1024 * 1024);
  const fileB = makeFixture("batch-b.mp4", LARGE_FIXTURE_BYTES); // past the 10MB cap too
  const fileC = makeFixture("batch-c.mp4", 1 * 1024 * 1024);
  await openUploadDialog(page);

  await page.locator('input[type="file"]').setInputFiles([fileA, fileB, fileC]);
  await expect(page.getByText("3 files queued")).toBeVisible();

  await page.getByRole("button", { name: /Upload 3/ }).click();

  // All three filenames must still be visible (none dropped from the queue), and if
  // any single file had silently truncated, its error text would show up somewhere on
  // the page — checked globally rather than scoped per-row, since Playwright has no
  // reliable way to isolate one flat queue-item div from generic "div" matching.
  for (const name of ["batch-a.mp4", "batch-b.mp4", "batch-c.mp4"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/upload incomplete/i)).toHaveCount(0);
  await expect(page.getByText(/upload failed/i)).toHaveCount(0);
  await expect(page.getByText(/couldn't reach the ingest service/i)).toHaveCount(3, {
    timeout: 20_000,
  });
});

test("canceling before upload starts clears the queue without any network call", async ({ page }) => {
  const file = makeFixture("never-sent.mp4", 1024 * 1024);
  await openUploadDialog(page);

  let uploadRequestSeen = false;
  page.on("request", (req) => {
    if (req.url().includes("/upload") && req.method() === "POST") uploadRequestSeen = true;
  });

  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("1 file queued")).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Upload deliverables")).not.toBeVisible();
  expect(uploadRequestSeen).toBe(false);
});
