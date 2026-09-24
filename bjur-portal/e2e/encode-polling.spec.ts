import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * A progress number that does not progress is worse than none.
 *
 * The page is a server component, so "Encoding 2%" was whatever was true when it opened —
 * a 20 GB master sat there for a quarter of an hour while the database said 15%. That is
 * the exact shape of "is this thing stuck?", which is a question that has already cost an
 * afternoon once.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

test("the percentage moves without a refresh, and stops when it lands", async ({ page }) => {
  const id = sql("SELECT id FROM Asset WHERE projectId='p1' AND kind='VIDEO' LIMIT 1;");
  const before = sql(`SELECT proxyStatus FROM Asset WHERE id='${id}';`);

  try {
    sql(`UPDATE Asset SET proxyStatus='GENERATING', proxyProgress=11 WHERE id='${id}';`);
    await page.goto("/admin/projects/p1");
    await expect(page.getByTestId(`file-${id}`)).toContainText("Encoding 11%");

    // Move it the way the worker would, and wait without touching the page.
    sql(`UPDATE Asset SET proxyProgress=62 WHERE id='${id}';`);
    await expect(page.getByTestId(`file-${id}`)).toContainText("Encoding 62%", { timeout: 15000 });

    // Finishing stops the polling: the row settles and stays settled.
    sql(`UPDATE Asset SET proxyStatus='READY', proxyProgress=NULL WHERE id='${id}';`);
    await expect(page.getByTestId(`file-${id}`)).not.toContainText("Encoding", { timeout: 15000 });

    // Nothing is encoding now, so a later change must NOT appear on its own — that is how
    // we know the interval was cleared rather than left running forever.
    sql(`UPDATE Asset SET proxyRes='POLLING-SHOULD-NOT-SEE-THIS' WHERE id='${id}';`);
    await page.waitForTimeout(9000);
    await expect(page.getByTestId(`file-${id}`)).not.toContainText("POLLING-SHOULD-NOT-SEE-THIS");
  } finally {
    sql(`UPDATE Asset SET proxyStatus='${before}', proxyProgress=NULL, proxyRes=NULL WHERE id='${id}';`);
  }
});
