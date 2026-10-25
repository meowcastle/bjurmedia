import { test, expect } from "@playwright/test";

// No storageState: these are the signed-out screens.
test.use({ storageState: { cookies: [], origins: [] } });

test("the email field is labelled Email and the URL chip is gone", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText("Username")).toHaveCount(0);
  // The chip restated the address bar, and "argon2 hashed" told a client nothing.
  await expect(page.getByText(/argon2/)).toHaveCount(0);
});

/**
 * PortalLogin13: the stamped seal, "Client portal", the headline, one line, the form and
 * the note about logins. NAS credits, "Secure connection" and the admin link stay gone.
 */
test("the login page is the v13 column", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Your work,\s*ready when you are\./ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask us" })).toHaveAttribute("href", "mailto:hi@bjur.nyc");
  for (const gone of ["Secure connection", "Synology", "Welcome back", "Admin sign in", "Bjur Media"]) {
    await expect(page.getByText(gone)).toHaveCount(0);
  }
});

test("Forgot password tells the client the studio has been notified", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("sasha@ssh.studio");
  await page.getByRole("button", { name: "Forgot password" }).click();
  await expect(page.getByText(/let the studio know you need a reset/)).toBeVisible();
});

test("the moved notice shows only for visits through the old address", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/moved from portal\.justinbjur\.com/)).toHaveCount(0);
  await page.goto("/login?from=jb");
  await expect(page.getByText("We've moved from portal.justinbjur.com. Same login.")).toBeVisible();
  // An old project link lands on sign in with the flag kept.
  await page.goto("/p/anything?from=jb");
  await expect(page).toHaveURL(/\/login\?from=jb$/);
  await expect(page.getByText(/moved from portal\.justinbjur\.com/)).toBeVisible();
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
