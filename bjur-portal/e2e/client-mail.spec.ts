import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * Emails #3, #5 and #6. Who gets each one and how often is the whole risk: these go to
 * clients on a schedule, so a rule that fires twice or reaches the wrong list is how a
 * sending domain ends up filtered.
 */
test("weekly digest, expiry reminder and license receipt rules", async () => {
  test.slow();
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "client-mail-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, out, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout: out }))
    );
  });
  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();
  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(15);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});

test.describe("emailed thumbnails", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an unsigned thumbnail request is still refused without a session", async ({ request }) => {
    // The signature is what lets mail clients load images; it must not have opened the
    // endpoint to anyone who guesses an asset id.
    const res = await request.get("/api/assets/anything/thumb");
    expect([401, 403, 404]).toContain(res.status());
  });

  test("a forged signature is refused", async ({ request }) => {
    const res = await request.get("/api/assets/anything/thumb?sig=bm90.arealsig");
    expect([401, 403, 404]).toContain(res.status());
  });
});
