import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * A reviewer who is also restricted to one delivery.
 *
 * Two separate grants met here and only one was being read. A login with any
 * ProjectMember row is a restricted login — it sees the projects it is listed on and no
 * others — but being added to a film's review cycle creates a Reviewer row and no
 * ProjectMember row at all. So the studio would add someone to the cycle, the cut-ready
 * email would go out, and the link in it 404'd for exactly the people it was sent to.
 */
const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

test.use({ storageState: "e2e/.auth/sasha.json" });

test("a reviewer restricted to another project can still open the cut", async ({ page }) => {
  const userId = sql("SELECT userId FROM Reviewer WHERE projectId='p2' AND email='sasha@ssh.studio';");
  const pmId = `zz-pm-${Date.now()}`;
  // Restricted to p1 only — the shape Jason's account was in.
  sql(
    `INSERT INTO ProjectMember (id, projectId, userId, role, createdAt) VALUES ('${pmId}','p1','${userId}','DOWNLOADER',CURRENT_TIMESTAMP);`
  );

  try {
    await page.goto("/p/p2/review");
    await expect(page.getByTestId("review-screen")).toBeVisible();

    // And the film is reachable from the portal, not only from the email.
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Product Launch/ })).toBeVisible();
  } finally {
    sql(`DELETE FROM ProjectMember WHERE id='${pmId}';`);
  }
});

test("a restricted login with no reviewer row still gets nothing", async ({ page }) => {
  // The restriction still means something: the Reviewer row is what opens this screen,
  // so revoking it closes the door again even while the ProjectMember row stands.
  const userId = sql("SELECT userId FROM Reviewer WHERE projectId='p2' AND email='sasha@ssh.studio';");
  const pmId = `zz-pm-${Date.now()}`;
  sql(
    `INSERT INTO ProjectMember (id, projectId, userId, role, createdAt) VALUES ('${pmId}','p1','${userId}','DOWNLOADER',CURRENT_TIMESTAMP);`
  );
  sql(`UPDATE Reviewer SET revokedAt=CURRENT_TIMESTAMP WHERE projectId='p2' AND userId='${userId}';`);

  try {
    const res = await page.goto("/p/p2/review");
    expect(res?.status()).toBe(404);
  } finally {
    sql(`UPDATE Reviewer SET revokedAt=NULL WHERE projectId='p2' AND userId='${userId}';`);
    sql(`DELETE FROM ProjectMember WHERE id='${pmId}';`);
  }
});
