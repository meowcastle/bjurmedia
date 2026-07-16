import { execSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";
import { request } from "@playwright/test";

/**
 * Runs once before the whole Playwright suite: resets the isolated e2e SQLite DB,
 * applies migrations + seed data, drops a couple of real sample files into the test
 * ARCHIVE_ROOT for the library-import spec, and pre-authenticates each test identity
 * once via direct API call (not the login form) so specs can reuse a saved session
 * instead of re-triggering the login rate limiter dozens of times across the suite.
 */
export default async function globalSetup() {
  const root = path.resolve(__dirname, "..");
  const testEnv = loadEnv({ path: path.join(root, ".env.test") }).parsed ?? {};
  const env = { ...process.env, ...testEnv };
  const baseURL = `http://localhost:${testEnv.PORT ?? 3100}`;

  rmSync(path.join(root, "data", "e2e.db"), { force: true });
  rmSync(path.join(root, testEnv.MEDIA_ROOT ?? "media-e2e"), { recursive: true, force: true });

  execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { cwd: root, env, stdio: "inherit" });

  const archiveRoot = path.resolve(root, testEnv.ARCHIVE_ROOT ?? "media-e2e/_archive");
  const folder = path.join(archiveRoot, "57NYC_old_dump", "2024");
  mkdirSync(folder, { recursive: true });

  const onePxJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
    "base64"
  );
  writeFileSync(path.join(folder, "IG_Archive_Still_01.jpg"), onePxJpeg);
  writeFileSync(path.join(folder, "IG_Archive_Still_02.jpg"), onePxJpeg);

  // The dev server (webServer) isn't guaranteed up yet at this point — Playwright starts
  // it in parallel with globalSetup, so poll briefly before trying to authenticate.
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/login`);
      if (res.ok || res.status === 307) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });

  const identities: { file: string; email: string; portal: "client" | "admin" }[] = [
    { file: "admin.json", email: "admin@bjurmedia.nyc", portal: "admin" },
    { file: "sasha.json", email: "sasha@ssh.studio", portal: "client" },
    { file: "ivy.json", email: "ivy@halcyon.film", portal: "client" },
  ];

  for (const id of identities) {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post("/api/auth/login", {
      data: { email: id.email, password: "bjurmedia2026", portal: id.portal },
    });
    if (!res.ok()) {
      throw new Error(`global-setup: failed to pre-authenticate ${id.email}: ${res.status()}`);
    }
    await ctx.storageState({ path: path.join(authDir, id.file) });
    await ctx.dispose();
  }
}
