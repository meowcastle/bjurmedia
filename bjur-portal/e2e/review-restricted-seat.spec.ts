import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
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

const DERIVED = path.join(__dirname, "..", "media-e2e", "_derived");

test("a reviewer restricted to another project can still open the cut", async ({ page }) => {
  const userId = sql("SELECT userId FROM Reviewer WHERE projectId='p2' AND email='sasha@ssh.studio';");
  // The seed makes no proxies, and the proxy route 404s on a missing file before it ever
  // reaches the access check — which would let this test pass while the bug was back.
  const assetId = sql("SELECT DISTINCT a.id FROM Asset a JOIN Review r ON r.assetId=a.id WHERE a.projectId='p2';");
  mkdirSync(path.join(DERIVED, assetId), { recursive: true });
  writeFileSync(path.join(DERIVED, assetId, "proxy.mp4"), Buffer.alloc(2048, 7));
  sql(`UPDATE Asset SET proxyRelPath='${assetId}/proxy.mp4' WHERE id='${assetId}';`);
  const pmId = `zz-pm-${Date.now()}`;
  // Restricted to p1 only — the shape Jason's account was in.
  sql(
    `INSERT INTO ProjectMember (id, projectId, userId, role, createdAt) VALUES ('${pmId}','p1','${userId}','DOWNLOADER',CURRENT_TIMESTAMP);`
  );

  try {
    await page.goto("/p/p2/review");
    await expect(page.getByTestId("review-screen")).toBeVisible();

    // The page rendering is not the test. The screen is chrome around a <video>, and a
    // plain <video src> carries no header a route could read, so the proxy request is
    // authorized by the same session and used to 404 under a page that looked fine.
    const src = await page.getByTestId("review-video").getAttribute("src");
    const proxy = await page.request.get(src!);
    expect(proxy.status(), "the cut has to actually stream").toBe(200);
    expect(proxy.headers()["accept-ranges"]).toBe("bytes");

    // A reviewer is asked to watch, not to take delivery.
    const dl = await page.request.get(`/api/assets/${assetId}/download`);
    expect(dl.status(), "watching is not downloading").not.toBe(200);

    // And the film is reachable from the portal, not only from the email.
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Product Launch/ })).toBeVisible();
  } finally {
    sql(`DELETE FROM ProjectMember WHERE id='${pmId}';`);
    sql(`UPDATE Asset SET proxyRelPath=NULL WHERE id='${assetId}';`);
    rmSync(path.join(DERIVED, assetId, "proxy.mp4"), { force: true });
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
