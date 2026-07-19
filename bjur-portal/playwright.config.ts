import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "path";

const testEnv = loadEnv({ path: path.resolve(__dirname, ".env.test") }).parsed ?? {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared SQLite test DB — avoid cross-test races
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${testEnv.PORT ?? 3100}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: `http://localhost:${testEnv.PORT ?? 3100}`,
    reuseExistingServer: !process.env.CI,
    // Tells src/lib/db.ts to skip enabling SQLite WAL mode. Flipping a fresh e2e.db
    // into WAL for the first time right as global-setup's separate `prisma migrate
    // deploy` process touches that same file causes a real, reproducible "database is
    // locked" — the two connections colliding during that one-time mode transition.
    // Not needed for e2e anyway: single test worker, no separate worker process.
    env: { ...testEnv, PLAYWRIGHT_TEST: "true" } as Record<string, string>,
    timeout: 60_000,
  },
});
