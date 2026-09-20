import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * The payment hold decides which file a client gets, in authz and the worker — neither
 * of which is reachable over HTTP. The harness drives authorizeAssetAccess directly
 * against a throwaway database.
 */
test("a payment hold marks the client's copy and fails closed", async () => {
  test.slow(); // builds its own database and applies migrations

  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "payment-hold-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout })),
    );
  });

  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();

  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(10);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});
