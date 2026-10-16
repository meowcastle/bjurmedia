import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * Transcription and caption drafting. The model's prose is not what these check — the
 * rules around it are: only new eligible reels are queued, a music video produces
 * nothing rather than invented copy, a person's own words are never overwritten, and a
 * draft stays visibly a draft.
 */
test("caption pipeline rules", async () => {
  test.slow();
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "caption-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 180_000 },
      (err, out, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout: out }))
    );
  });
  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();
  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(14);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});

test.describe("the per-client switch", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("is off by default and is a boolean", async ({ request }) => {
    const bad = await request.patch("/api/admin/clients/c1", { data: { autoCaption: "yes" } });
    expect(bad.status()).toBe(400);

    const on = await request.patch("/api/admin/clients/c1", { data: { autoCaption: true } });
    expect(on.ok()).toBe(true);
    const off = await request.patch("/api/admin/clients/c1", { data: { autoCaption: false } });
    expect(off.ok()).toBe(true);
  });

  test("lives on Integrations, with the privacy consequence stated", async ({ page }) => {
    // Moved off the client page: every integration is edited in one place now, so "what
    // is switched on for this client" is answerable by looking rather than remembering.
    await page.goto("/admin/integrations");
    await expect(page.getByTestId("captions-c1")).toBeVisible();
    // The reason it is off by default has to be on screen, not just in a commit message —
    // on the column it governs now, rather than in a paragraph above the table.
    await expect(page.getByText("AI captions", { exact: true })).toHaveAttribute(
      "title",
      /sends the client's audio to a third party/i,
    );
  });
});

test.describe("editing a draft", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("claims it as the editor's own", async ({ page, request }) => {
    await page.goto("/admin/media?project=p1");
    const rowId = (await page
      .locator('[data-testid^="asset-row-"]')
      .first()
      .getAttribute("data-testid"))!;
    const assetId = rowId.replace("asset-row-", "");

    // Editing any of the copy is the review. A separate "approve" gesture would just
    // train people to click it without reading.
    const res = await request.patch(`/api/admin/assets/${assetId}`, {
      data: { caption: "Words I wrote myself." },
    });
    expect(res.ok()).toBe(true);

    await page.reload();
    const row = page.getByTestId(rowId);
    await expect(row.getByText("DRAFT CAPTION")).toHaveCount(0);
  });
});

/**
 * One setting, one place. The media page carried a second copy of this switch; it is a
 * client-wide policy, and Integrations is where client-wide integrations are set.
 */
test.describe("the switch", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("is on Integrations and nowhere on the media page", async ({ page }) => {
    await page.goto("/admin/media?project=p1");
    await expect(page.locator('[data-testid^="asset-row-"]').first()).toBeVisible();
    await expect(page.getByTestId("media-auto-caption")).toHaveCount(0);

    await page.goto("/admin/integrations");
    await expect(page.getByTestId("captions-c1")).toBeVisible();
  });
});
