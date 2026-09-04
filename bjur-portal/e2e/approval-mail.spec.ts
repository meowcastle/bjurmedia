import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

test("approval email recipients and signed links", async () => {
  test.slow();
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "approval-mail-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, out, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout: out }))
    );
  });
  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();
  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(10);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});

/** Signs a token the way src/lib/publishToken.ts does, using the suite's own secret. */
function sign(payload: object) {
  const secret = fs
    .readFileSync(path.join(__dirname, "..", ".env.test"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("SESSION_SECRET="))!
    .split("=")[1]
    .replace(/^["']|["']$/g, "")
    .trim();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

test.describe("the emailed action link", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("a forged token is turned away, not honoured", async ({ page }) => {
    const bad = "eyJhIjoxfQ.notarealsignature";
    const res = await page.goto(`/api/projects/p8/posts/anything/act?t=${bad}`);
    expect(res!.status()).toBe(410);
    await expect(page.getByText("This link has expired")).toBeVisible();
  });

  test("an expired token is turned away", async ({ page }) => {
    const token = sign({ assetId: "whatever", action: "approve", exp: Date.now() - 5000 });
    const res = await page.goto(`/api/projects/p8/posts/whatever/act?t=${token}`);
    expect(res!.status()).toBe(410);
  });

  test("a valid link asks before it does anything", async ({ page, request }) => {
    // Find the post p8 has waiting, straight from the client-facing panel.
    await page.goto("/admin/media?project=p8");
    const rowId = (await page
      .locator('[data-testid^="asset-row-"]')
      .first()
      .getAttribute("data-testid"))!;
    const assetId = rowId.replace("asset-row-", "");

    // Put it into AWAITING deterministically rather than relying on which row is first.
    await request.post(`/api/admin/assets/${assetId}/publish`, {
      data: {
        action: "schedule",
        publishAt: new Date(Date.now() + 86_400_000).toISOString(),
        publishIg: true,
      },
    });
    const asked = await request.post(`/api/admin/assets/${assetId}/publish`, {
      data: { action: "request-approval" },
    });
    expect(asked.ok()).toBe(true);

    const token = sign({ assetId, action: "approve", exp: Date.now() + 3_600_000 });
    await page.goto(`/api/projects/p8/posts/${assetId}/act?t=${token}`);

    // A GET must be side-effect free — Outlook Safe Links, Gmail's proxy and corporate
    // scanners all fetch links in mail. Loading it twice and still being offered the
    // confirm button is what proves the first load changed nothing; the route renders
    // "Nothing left to do" the moment the post stops being AWAITING.
    await expect(page.getByRole("button", { name: /Yes, approve it/ })).toBeVisible();
    await page.goto(`/api/projects/p8/posts/${assetId}/act?t=${token}`);
    await expect(page.getByRole("button", { name: /Yes, approve it/ })).toBeVisible();

    // Confirming is what performs it.
    await page.getByRole("button", { name: /Yes, approve it/ }).click();
    await expect(page.getByText("Approved")).toBeVisible();

    // And a second confirm finds nothing left to do rather than re-approving.
    await page.goto(`/api/projects/p8/posts/${assetId}/act?t=${token}`);
    await expect(page.getByText("Nothing left to do")).toBeVisible();

    await request.post(`/api/admin/assets/${assetId}/publish`, { data: { action: "unschedule" } });
  });
});
