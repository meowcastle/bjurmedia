import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import crypto from "crypto";

/**
 * Pausing and resuming must continue the same upload, not start a second one.
 *
 * The submission's id used to live only inside the upload function, so pausing returned
 * the file to the queue looking brand new. Resuming then created a second submission —
 * which truncates the partial file at that path — and re-sent the whole file from zero,
 * stranding the first row at "uploading" forever. On a 200GB file that is hours of work
 * thrown away, and the admin sees a phantom upload that never finishes.
 */
test.use({ storageState: "e2e/.auth/sasha.json" });

const UPLOAD = "/p/p1/upload";
// Big enough to span several 16MB chunks, so there is a real middle to pause in.
const SIZE = 40 * 1024 * 1024;

let tmpDir: string;
test.beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "bjur-pause-"));
});
test.afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test("pausing and resuming continues one upload instead of starting a second", async ({
  page,
}) => {
  const name = `pause-resume-${Date.now()}.bin`;
  const file = path.join(tmpDir, name);
  writeFileSync(file, crypto.randomBytes(SIZE));

  // Slow each chunk so there is a real middle to pause in. On loopback the whole file
  // otherwise lands in under a second and the pause never happens — which is exactly
  // why this bug survived to production.
  await page.route("**/submissions/*/chunk", async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.continue();
  });

  await page.goto(UPLOAD);
  await page.locator('input[type="file"]').first().setInputFiles([file]);

  const created: string[] = [];
  page.on("response", (r) => {
    // Every POST here is a *new* submission row. There must only ever be one.
    if (r.url().endsWith("/submissions") && r.request().method() === "POST") {
      created.push(r.url());
    }
  });

  await page.getByRole("button", { name: /^Upload \d/ }).click();

  // Let a chunk or two land, then pause mid-file.
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pause" }).click();

  const resume = page.getByRole("button", { name: "Resume" });
  await expect(resume).toBeVisible();
  await resume.click();

  // It finishes.
  await expect(page.getByText(/1 of 1 files|Done|Complete/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // The actual guarantee: one submission row, not two.
  expect(created.length, `created ${created.length} submissions for one file`).toBe(1);

  // And the server holds the whole file, not a restarted fragment.
  const list = await page.request.get("/api/projects/p1/submissions");
  const body = await list.json();
  const mine = (body.submissions ?? []).filter(
    (s: { relativePath: string }) => s.relativePath === name,
  );
  // Nothing incomplete left behind for this file — a stranded row would show here.
  expect(mine.length, "an abandoned submission was left in progress").toBe(0);
});
