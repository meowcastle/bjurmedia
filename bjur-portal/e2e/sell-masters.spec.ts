import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * The "Sell masters" switch is what replaced Client.type, and it only means anything at
 * ingest — which is worker code, not reachable over HTTP. The harness drives ingestFile
 * directly against a throwaway database and its own media root.
 */
test("sell-masters decides a master's fate on ingest", async () => {
  test.slow(); // builds its own database and applies migrations

  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "sell-masters-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout })),
    );
  });

  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();

  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBeGreaterThan(5);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});
