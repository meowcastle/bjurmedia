import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The three v13 pieces that came after the re-skin: the studio's one line on Latest,
 * "Viewed N times" on a project, and the client's logo on a guest's name screen.
 */
const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

test.describe("client", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("Latest shows the studio's description, and the counts without one", async ({ page }) => {
    await page.goto("/");
    const latest = page.getByTestId("latest-project");
    const id = await latest.getByRole("link", { name: /Open project/ }).getAttribute("href").then((h) => h!.split("/")[2]);
    await expect(latest.locator(".bj-lead")).toHaveText(/\d+ (video|still)/);
    sql(`UPDATE Project SET description='Short-form edit with a color pass.' WHERE id='${id}';`);
    try {
      await page.reload();
      await expect(latest.locator(".bj-lead")).toHaveText("Short-form edit with a color pass.");
    } finally {
      sql(`UPDATE Project SET description=NULL WHERE id='${id}';`);
    }
  });

  test("opening a project counts one view per tab, and the meta line says so", async ({ page }) => {
    const id = sql("SELECT id FROM Project WHERE title='Spring Campaign 2026';");
    const before = Number(sql(`SELECT viewCount FROM Project WHERE id='${id}';`));
    try {
      await page.goto(`/p/${id}`);
      await expect.poll(() => Number(sql(`SELECT viewCount FROM Project WHERE id='${id}';`))).toBe(before + 1);
      // A refresh in the same tab is the same visit.
      await page.reload();
      await expect(page.getByTestId("project-views")).toHaveText(`Viewed ${before + 1} ${before + 1 === 1 ? "time" : "times"}`);
      expect(Number(sql(`SELECT viewCount FROM Project WHERE id='${id}';`))).toBe(before + 1);
    } finally {
      sql(`UPDATE Project SET viewCount=${before} WHERE id='${id}';`);
    }
  });
});

test.describe("studio", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("staff opening the client view are never counted", async ({ request }) => {
    const id = sql("SELECT id FROM Project WHERE title='Spring Campaign 2026';");
    const before = sql(`SELECT viewCount FROM Project WHERE id='${id}';`);
    expect((await request.post(`/api/client/projects/${id}/view`)).status()).toBe(204);
    expect(sql(`SELECT viewCount FROM Project WHERE id='${id}';`)).toBe(before);
  });

  test("the description saves from the project page", async ({ page }) => {
    await page.goto("/admin/projects/p2");
    const field = page.getByTestId("project-description");
    try {
      await field.fill("  A three-minute film,   cut twice.  ");
      await field.press("Enter");
      await expect.poll(() => sql("SELECT description FROM Project WHERE id='p2';")).toBe("A three-minute film, cut twice.");
    } finally {
      sql("UPDATE Project SET description=NULL WHERE id='p2';");
    }
  });
});

test("a guest's name screen shows the client's mark beside the seal", async ({ page }) => {
  const token = sql("SELECT token FROM Reviewer WHERE projectId='p2' AND kind='GUEST' AND email='tom@reyes.film';");
  const before = sql(`SELECT name FROM Reviewer WHERE token='${token}';`);
  sql(`UPDATE Reviewer SET name='' WHERE token='${token}';`);
  try {
    await page.goto(`/r/${token}`);
    await expect(page.getByTestId("guest-name")).toBeVisible();
    await expect(page.locator(".bj-rv-nav").locator(".bj-lg, .bj-av")).toBeVisible();
  } finally {
    sql(`UPDATE Reviewer SET name='${before.replace(/'/g, "''")}' WHERE token='${token}';`);
  }
});
