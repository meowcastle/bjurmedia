import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";

/** Who the new-files email reaches: client members, not a login's first client. */
test("delivery email goes to client members", async () => {
  test.slow();
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", path.join(__dirname, "delivery-recipients-harness.ts")],
      { cwd: path.join(__dirname, ".."), timeout: 120_000 },
      (err, out, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve({ stdout: out }))
    );
  });
  const line = stdout.trim().split("\n").filter((l) => l.startsWith("[")).pop();
  expect(line, "harness produced no result line").toBeTruthy();
  const results = JSON.parse(line!) as { name: string; pass: boolean; detail?: string }[];
  expect(results.length).toBe(8);
  expect(results.filter((r) => !r.pass).map((f) => `${f.name} — ${f.detail ?? ""}`)).toEqual([]);
});
