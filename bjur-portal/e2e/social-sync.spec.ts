import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

async function runHarness(file: string) {
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, file)],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout }))
    );
  });
  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();
  return JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
}

/**
 * Attribution is the part that matters: which delivered file a post's views are credited
 * to. The fetchers are faked in the harness so the matching rules can be exercised
 * without a live account.
 */
test("insights sync attribution rules", async () => {
  test.slow();
  const results = await runHarness("social-sync-harness.ts");
  expect(results.length).toBeGreaterThan(8);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});

test.describe("sync now", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("reports per-account state rather than a bare ok", async ({ request }) => {
    const res = await request.post("/api/admin/social/sync");
    expect(res.ok()).toBe(true);

    const body = (await res.json()) as {
      accountsSynced: number;
      failed: number;
      accounts: { client: string; platform: string; error: string | null }[];
    };
    // The seed connects three accounts; a sync that silently found none would be a
    // green result that meant nothing.
    expect(body.accountsSynced).toBeGreaterThan(0);
    expect(body.accounts.length).toBe(body.accountsSynced);
    expect(body.accounts.every((a) => a.client && a.platform)).toBe(true);

    // These have no reachable credentials in the test environment, so they are expected
    // to fail — the point is that the failure is reported instead of thrown.
    expect(body.failed).toBe(body.accounts.filter((a) => a.error).length);
  });

  test("the button is on the page and reports back", async ({ page }) => {
    await page.goto("/admin/integrations");
    await page.getByTestId("sync-now").click();
    await expect(page.getByTestId("sync-result")).toBeVisible();
  });

  test("a signed-out caller cannot trigger a sync", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    expect((await ctx.request.post("/api/admin/social/sync")).status()).toBe(401);
    await ctx.close();
  });
});
