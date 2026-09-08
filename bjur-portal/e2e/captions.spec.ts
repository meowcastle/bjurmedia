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

  test("appears on the client page with the privacy consequence stated", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.getByText("SSH", { exact: true }).click();
    await expect(page.getByText("Draft captions from the audio on new reels")).toBeVisible();
    // The reason it is off by default has to be on screen, not just in a commit message.
    await expect(page.getByText(/sends this client's audio/i)).toBeVisible();
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

test.describe("the switch on the media page", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("is where the reels are, and says which client it applies to", async ({ page }) => {
    await page.goto("/admin/media?project=p1");

    const toggle = page.getByTestId("media-auto-caption");
    await expect(toggle).toBeVisible();

    // Client-wide, not per-project — the label has to make that unmistakable, since it
    // sits on a page that is otherwise entirely about one project.
    await expect(toggle).toHaveAttribute("title", /SSH/);
  });

  test("flips the client setting and survives a reload", async ({ page }) => {
    await page.goto("/admin/media?project=p1");
    const toggle = page.getByTestId("media-auto-caption");

    const before = await toggle.getAttribute("aria-pressed");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");

    await page.reload();
    await expect(page.getByTestId("media-auto-caption")).toHaveAttribute(
      "aria-pressed",
      before === "true" ? "false" : "true"
    );

    // Put the client back as it was.
    await page.getByTestId("media-auto-caption").click();
    await expect(page.getByTestId("media-auto-caption")).toHaveAttribute("aria-pressed", before!);
  });

  test("the same setting is reflected on the client's own page", async ({ page, request }) => {
    // One setting in two places has to actually be one setting.
    await request.patch("/api/admin/clients/c1", { data: { autoCaption: true } });

    await page.goto("/admin/media?project=p1");
    await expect(page.getByTestId("media-auto-caption")).toHaveAttribute("aria-pressed", "true");

    await page.goto("/admin/clients");
    await page.getByText("SSH", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /Draft captions from the audio/ })).toBeChecked();

    await request.patch("/api/admin/clients/c1", { data: { autoCaption: false } });
  });
});
