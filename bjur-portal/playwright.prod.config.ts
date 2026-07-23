import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "path";

const testEnv = loadEnv({ path: path.resolve(__dirname, ".env.test") }).parsed ?? {};

// `next dev` never reproduces Next.js's "proxy" request-body buffering (10MB default
// cap, no error thrown) — it's production-runtime-only behavior, confirmed by directly
// reverting the middleware fix and re-running upload-chaos.spec.ts against `pnpm dev`:
// it still passed. This config runs the same spec against a real production build
// (`next build && next start`) instead, so a regression here actually fails the test.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /upload-chaos\.spec\.ts/,
  fullyParallel: false,
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
    // `next start` silently ignores `output: standalone` and runs a different code
    // path than the real deployment (Dockerfile's CMD is `node .next/standalone/
    // server.js`) — so build+copy+run the actual standalone server here, matching
    // production exactly instead of a close-but-not-identical stand-in.
    command:
      "npx prisma generate && next build && " +
      "cp -r .next/static .next/standalone/.next/static && " +
      "cp -r public .next/standalone/public && " +
      "cd .next/standalone && node server.js",
    url: `http://localhost:${testEnv.PORT ?? 3100}`,
    reuseExistingServer: !process.env.CI,
    env: { ...testEnv, PLAYWRIGHT_TEST: "true" } as Record<string, string>,
    timeout: 180_000, // a real build + prod boot, not next dev's instant startup
  },
});
