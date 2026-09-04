import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * The publisher's guarantees cannot be reached over HTTP — it is worker code, and the
 * cases that matter are about what happens when uploads fail or the process dies partway.
 * e2e/publisher-harness.ts drives it directly against a throwaway database with the
 * Google calls faked; this runs it and reports each case as its own assertion.
 */
test("publisher state machine", async () => {
  test.slow(); // spins up its own database and applies migrations to it

  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "publisher-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout }))
    );
  });

  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();

  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(10);

  const failures = results.filter((r) => !r.pass);
  expect(failures.map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});
