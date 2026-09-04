/**
 * Throwaway database for harnesses that drive worker code directly.
 *
 * Its own file rather than the e2e database: these write states the HTTP surface cannot
 * reach, and sharing a SQLite file with a running dev server invites "database is
 * locked" for no benefit.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function bootstrapHarnessDb() {
  // realpath because /var/folders is itself a symlink on macOS, and the media helpers
  // compare real paths — every lookup would otherwise look like an escape attempt.
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "bjur-harness-")));
  const dbPath = path.join(dir, "test.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.DERIVED_ROOT = dir;
  process.env.MEDIA_ROOT = dir;
  delete process.env.SLACK_WEBHOOK_URL;

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: "pipe",
  });

  return dir;
}

export type CheckResult = { name: string; pass: boolean; detail?: string };

export function makeChecker(results: CheckResult[]) {
  return (name: string, pass: boolean, detail?: string) => results.push({ name, pass, detail });
}
