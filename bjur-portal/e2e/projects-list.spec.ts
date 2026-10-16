import { test, expect, request as pwRequest } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

test.use({ storageState: "e2e/.auth/sasha.json" });

/**
 * A handful of cards is faster to scan than to search, so search and sort only appear
 * once a client has eight projects. The seeded client has three.
 */
test("a short list has no search or sort, and says Projects once", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByLabel("Search projects")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "A–Z" })).toHaveCount(0);
  await expect(page.getByText(/active projects?$/)).toHaveCount(0);
});

test.describe("with eight or more projects", () => {
  const made: string[] = [];

  test.beforeAll(async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL: baseURL!, storageState: "e2e/.auth/admin.json" });
    for (let i = 0; i < 5; i++) {
      const res = await api.post("/api/admin/projects", {
        data: { clientId: "c1", title: `List Spec ${i} ${Date.now()}`, type: "DELIVERY" },
      });
      expect(res.ok()).toBeTruthy();
      made.push((await res.json()).project.id);
    }
    await api.dispose();
    // A new project is a draft until its first file lands, and drafts never reach the
    // client's list.
    sql(`UPDATE Project SET status='LIVE' WHERE id IN (${made.map((id) => `'${id}'`).join(",")});`);
  });

  test.afterAll(async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL: baseURL!, storageState: "e2e/.auth/admin.json" });
    for (const id of made) await api.delete(`/api/admin/projects/${id}`);
    await api.dispose();
  });

  test("search filters the list and says so when nothing matches", async ({ page }) => {
    await page.goto("/");

    const search = page.getByLabel("Search projects");
    await expect(search).toBeVisible();

    await expect(page.getByText("Spring Campaign 2026")).toBeVisible();

    await search.fill("spring");
    await expect(page.getByText("Spring Campaign 2026")).toBeVisible();

    await search.fill("nothingmatchesthis");
    await expect(page.getByText(/No projects match/)).toBeVisible();
    await expect(page.getByText("Spring Campaign 2026")).toHaveCount(0);

    // Clearing restores the full list rather than leaving the empty state stuck.
    await search.fill("");
    await expect(page.getByText("Spring Campaign 2026")).toBeVisible();
  });

  test("A–Z reorders the cards and Newest puts them back", async ({ page }) => {
    await page.goto("/");

    const titles = () => page.locator("a[href^='/p/'] .text-xl").allTextContents();
    const byNewest = await titles();

    await page.getByRole("button", { name: "A–Z" }).click();
    const az = await titles();
    expect(az).toEqual([...byNewest].sort((a, b) => a.localeCompare(b)));

    await page.getByRole("button", { name: "Newest" }).click();
    expect(await titles()).toEqual(byNewest);
  });
});

test("cards state a size and drop the LIVE kicker", async ({ page }) => {
  await page.goto("/");

  const card = page.locator("a[href^='/p/']").first();
  // A real size, not NaN — the per-project byte sum crossed the RSC boundary as a
  // string because BigInt cannot.
  await expect(card).toContainText(/\d+(\.\d+)? (MB|GB)/);
  await expect(card).not.toContainText("Open →");
  await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);
});

/**
 * A Film project's card opens the cut, not a gallery of one file, and says when a cut is
 * waiting on the client. Both props were once dropped between the page and the card, so
 * every Film project quietly opened the gallery and the prompt never rendered.
 */
test("a Film project's card opens the review and says a cut is waiting", async ({ page }) => {
  await page.goto("/");

  // p2 is seeded as Film with a sent, still-pending cut.
  const card = page.locator("a[href='/p/p2/review']");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Cut awaiting your notes");
  await expect(page.locator("a[href='/p/p2']")).toHaveCount(0);

  await card.click();
  await expect(page).toHaveURL("/p/p2/review");
  await expect(page.getByTestId("review-screen")).toBeVisible();
});
