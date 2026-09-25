import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The files half of a film project: what the studio can do to an upload, and what the
 * cut list says about it.
 *
 * Two rules, both learned from one screen that got them wrong. A file that landed in the
 * wrong project, or is simply the wrong export, has to be removable — there was no way
 * to delete one at all. And the cut list is what the client can watch: a file hidden
 * from them is not a cut, however it got numbered.
 */
const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

test.use({ storageState: "e2e/.auth/admin.json" });

async function openFile(page: import("@playwright/test").Page, assetId: string) {
  await page.getByTestId(`file-${assetId}`).click();
  await expect(page.getByTestId("admin-proxy-viewer")).toBeVisible();
}

test("deleting a file takes two clicks, and says so", async ({ page }) => {
  const assetId = sql("SELECT id FROM Asset WHERE projectId='p2' AND kind='VIDEO' LIMIT 1;");
  await page.goto("/admin/projects/p2");
  await openFile(page, assetId);

  const del = page.getByTestId("delete-asset");
  await expect(del).toHaveText("Delete file");
  await del.click();
  // Armed, not fired: nothing has left the database.
  await expect(del).toHaveText(/click again/i);
  expect(sql(`SELECT COUNT(*) FROM Asset WHERE id='${assetId}';`)).toBe("1");
});

test("arming delete on one file does not arm the next", async ({ page }) => {
  const assetId = sql("SELECT id FROM Asset WHERE projectId='p2' AND kind='VIDEO' LIMIT 1;");
  await page.goto("/admin/projects/p2");
  await openFile(page, assetId);

  await page.getByTestId("delete-asset").click();
  await expect(page.getByTestId("delete-asset")).toHaveText(/click again/i);
  // Arrowing on carries the arm with it unless the arm belongs to a file rather than to
  // the viewer — which is one keypress away from deleting the wrong thing.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("delete-asset")).toHaveText("Delete file");
});

test("a file that cannot be removed from disk stays in the list", async ({ page }) => {
  // There is no worker in e2e, so the cleanup call fails — which is the case that matters:
  // dropping the row while the master survives leaves a file nothing points at.
  const assetId = sql("SELECT id FROM Asset WHERE projectId='p2' AND kind='VIDEO' LIMIT 1;");
  await page.goto("/admin/projects/p2");
  await openFile(page, assetId);

  await page.getByTestId("delete-asset").click();
  await page.getByTestId("delete-asset").click();

  await expect(page.getByText(/cleanup service|underlying file/i)).toBeVisible();
  expect(sql(`SELECT COUNT(*) FROM Asset WHERE id='${assetId}';`)).toBe("1");
});

test("a cut on a hidden file is not in the cut list", async ({ page }) => {
  // An unsent cut on a file the client cannot open: a tab on the review screen that
  // leads nowhere.
  const assetId = sql(
    "SELECT id FROM Asset WHERE projectId='p2' AND kind='VIDEO' AND internal=0 AND id NOT IN (SELECT assetId FROM Review) LIMIT 1;"
  );
  const cutId = `zz-hidden-${Date.now()}`;
  sql(
    `INSERT INTO Review (id, assetId, version, sourceGen, state, createdAt) VALUES ('${cutId}','${assetId}',9,0,'PENDING',CURRENT_TIMESTAMP);`
  );

  try {
    await page.goto("/admin/projects/p2");
    const cuts = page.getByTestId("film-cuts");
    await expect(cuts).toContainText("Cut 9");

    sql(`UPDATE Asset SET internal=1 WHERE id='${assetId}';`);
    await page.reload();
    await expect(cuts).not.toContainText("Cut 9");
  } finally {
    sql(`DELETE FROM Review WHERE id='${cutId}';`);
    sql(`UPDATE Asset SET internal=0 WHERE id='${assetId}';`);
  }
});
