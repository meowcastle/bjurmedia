import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * A client owner adding their own people to one project (lib/projectPeople.ts).
 *
 * What has to hold: a person added this way sees this project only, at View or View and
 * download, never Owner; on a Film project they are on the review; and taking them off
 * their last project removes them from the client rather than leaving a login with no
 * project rows, which would read as "sees everything".
 */
const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

function cleanup(email: string) {
  const id = sql(`SELECT id FROM User WHERE email='${email}';`);
  if (!id) return;
  sql(`DELETE FROM Reviewer WHERE email='${email}';`);
  sql(`DELETE FROM ProjectMember WHERE userId='${id}';`);
  sql(`DELETE FROM ClientMember WHERE userId='${id}';`);
  sql(`DELETE FROM Session WHERE userId='${id}';`);
  sql(`DELETE FROM User WHERE id='${id}';`);
}

test.describe("owner", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("adds someone to a film, who lands on this project and the review only", async ({ page }) => {
    const email = `editor-${Date.now()}@ssh.studio`;
    try {
      await page.goto("/p/p2");
      await page.getByTestId("people-open").click();
      const dialog = page.getByTestId("people-dialog");
      await expect(dialog.getByTestId("people-list")).toContainText("sasha@ssh.studio");

      await dialog.locator("#pname").fill("Eddie Editor");
      await dialog.locator("#pemail").fill(email);
      await dialog.locator("#prole").selectOption("VIEWER");
      await dialog.getByRole("button", { name: "Add and email them" }).click();
      await expect(dialog.getByTestId("people-done")).toContainText("Eddie Editor is in");
      await expect(dialog.getByTestId("people-list")).toContainText(email);

      const id = sql(`SELECT id FROM User WHERE email='${email}';`);
      expect(sql(`SELECT role FROM ClientMember WHERE userId='${id}';`)).toBe("VIEWER");
      expect(sql(`SELECT projectId || ':' || role FROM ProjectMember WHERE userId='${id}';`)).toBe("p2:VIEWER");
      expect(sql(`SELECT kind FROM Reviewer WHERE projectId='p2' AND userId='${id}' AND revokedAt IS NULL;`)).toBe("SEAT");
      expect(sql(`SELECT mustChangePassword FROM User WHERE id='${id}';`)).toBe("1");

      // Off again: their last project here, so the membership goes too.
      await dialog.getByRole("button", { name: "Remove Eddie Editor" }).click();
      await expect(dialog.getByTestId("people-done")).toContainText("no longer has access");
      expect(sql(`SELECT count(*) FROM ProjectMember WHERE userId='${id}';`)).toBe("0");
      expect(sql(`SELECT count(*) FROM ClientMember WHERE userId='${id}';`)).toBe("0");
      expect(sql(`SELECT revokedAt IS NOT NULL FROM Reviewer WHERE projectId='p2' AND userId='${id}';`)).toBe("1");
    } finally {
      cleanup(email);
    }
  });

  test("never grants owner, and owners cannot be removed here", async ({ request }) => {
    const owner = await request.post("/api/client/projects/p1/people", {
      data: { name: "Olly", email: `olly-${Date.now()}@ssh.studio`, role: "OWNER" },
    });
    expect(owner.status()).toBe(400);

    const sashaId = sql("SELECT id FROM User WHERE email='sasha@ssh.studio';");
    expect((await request.delete(`/api/client/projects/p1/people/${sashaId}`)).status()).toBe(400);
  });

  test("someone who already sees every project is not narrowed to one", async ({ request }) => {
    const res = await request.post("/api/client/projects/p1/people", {
      data: { name: "Marco", email: "marco@ssh.studio", role: "VIEWER" },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/every project/);
    expect(sql("SELECT count(*) FROM ProjectMember pm JOIN User u ON u.id=pm.userId WHERE u.email='marco@ssh.studio';")).toBe("0");
  });

  test("the review screen links an owner to People", async ({ page }) => {
    await page.goto("/p/p2/review");
    await page.getByTestId("review-people").click();
    await expect(page.getByTestId("people-dialog")).toBeVisible();
  });
});

test.describe("not an owner", () => {
  test.use({ storageState: "e2e/.auth/dana57.json" });

  test("gets no People button and no access to the API", async ({ page, request }) => {
    const project = sql("SELECT p.id FROM Project p JOIN Client c ON c.id=p.clientId WHERE c.name='57.NYC' AND p.status='LIVE' LIMIT 1;");
    await page.goto(`/p/${project}`);
    await expect(page.getByTestId("people-open")).toHaveCount(0);
    expect((await request.get(`/api/client/projects/${project}/people`)).status()).toBe(404);
    expect(
      (await request.post(`/api/client/projects/${project}/people`, { data: { name: "X", email: "x@x.test", role: "VIEWER" } })).status()
    ).toBe(404);
  });

  test("cannot reach another client's project either", async ({ request }) => {
    expect((await request.get("/api/client/projects/p2/people")).status()).toBe(404);
  });
});
