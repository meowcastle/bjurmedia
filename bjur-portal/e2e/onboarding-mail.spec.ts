import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * First-login details in the cut-ready mail, the one-time review guide, and Film ingests
 * staying quiet until release. e2e/onboarding-mail-harness.ts drives the real functions
 * against a throwaway database with only the mail senders injected.
 */
test("first-login mail and review guide", async () => {
  test.slow(); // spins up its own database and applies migrations to it
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "onboarding-mail-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, out, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout: out }))
    );
  });
  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();
  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(30);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});
