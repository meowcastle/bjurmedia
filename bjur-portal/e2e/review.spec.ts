import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * The review loop's guarantees are about versions, idempotency and who may answer —
 * none of which are reachable over HTTP. e2e/review-harness.ts drives the real
 * functions against a throwaway database with only the mail senders injected.
 */
test("review loop", async () => {
  test.slow(); // spins up its own database and applies migrations to it

  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "review-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout }))
    );
  });

  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();

  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(20);

  const failures = results.filter((r) => !r.pass);
  expect(failures.map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});
