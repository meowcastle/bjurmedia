import { test, expect } from "@playwright/test";

// No storageState: these are the signed-out screens.
test.use({ storageState: { cookies: [], origins: [] } });

test("the email field is labelled Email and the URL chip is gone", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText("Username")).toHaveCount(0);
  // The chip restated the address bar, and "argon2 hashed" told a client nothing.
  await expect(page.getByText(/argon2/)).toHaveCount(0);
  await expect(page.getByText("Secure connection")).toBeVisible();
});

test("Show reveals the password and Hide puts it back", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password");
  await password.fill("hunter2");

  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("Forgot? tells the client the studio has been notified", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("sasha@ssh.studio");
  await page.getByRole("button", { name: "Forgot?" }).click();
  await expect(page.getByText(/told the studio you need a reset/)).toBeVisible();
});

/**
 * The response must not differ between a real account and one that was never issued.
 * Anything else hands an unauthenticated caller a way to enumerate the client list —
 * the same reason the login route fails a deactivated account exactly like a wrong
 * password.
 */
test("the reset endpoint does not reveal whether an account exists", async ({ request }) => {
  const real = await request.post("/api/auth/forgot", {
    data: { email: "sasha@ssh.studio" },
  });
  const fake = await request.post("/api/auth/forgot", {
    data: { email: "definitely-not-a-user@nowhere.invalid" },
  });

  // Assert 200 explicitly, not just that the two agree: once the rate limiter trips,
  // both would return an identical 429 and this test would pass without ever
  // exercising the branch it exists to check.
  expect(real.status()).toBe(200);
  expect(fake.status()).toBe(200);
  expect(await real.text()).toBe(await fake.text());
});

test("the reset endpoint is rate limited", async ({ request }) => {
  // Six in a row against a five-per-window limit.
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await request.post("/api/auth/forgot", { data: { email: `probe${i}@nowhere.invalid` } });
    codes.push(res.status());
  }
  expect(codes).toContain(429);
});
