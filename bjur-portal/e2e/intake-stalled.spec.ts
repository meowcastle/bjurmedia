import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * An upload nobody has touched in days is abandoned, not in progress.
 *
 * Adam Knight's page showed "4 receiving" against batches last written to between three
 * and fifteen days earlier, each with a live progress bar. The status was derived from
 * "some file is incomplete" with no regard for when, so a fortnight-dead transfer looked
 * like something happening right now.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

test("a long-silent upload reads as stalled, not receiving", async ({ page }) => {
  const batchId = sql(
    "SELECT b.id FROM UploadBatch b WHERE EXISTS (SELECT 1 FROM Submission s WHERE s.batchId=b.id AND s.status='UPLOADING') LIMIT 1;"
  );
  expect(batchId, "seed needs a part-finished batch").toBeTruthy();
  const clientId = sql(`SELECT clientId FROM UploadBatch WHERE id='${batchId}';`);

  // Push its last activity a week back, the way a real abandoned transfer looks.
  sql(
    `UPDATE Submission SET updatedAt = strftime('%s','now','-7 days')*1000 WHERE batchId='${batchId}';`
  );

  try {
    await page.goto(`/admin/clients/${clientId}`);
    const row = page.getByTestId(`batch-${batchId}`);
    await expect(row).toContainText("Stalled");
    await expect(row).not.toContainText("Receiving");
    // And it says what actually happened, rather than showing a bar that will not move.
    await expect(row).toContainText(/Nothing since/);
    await expect(row).toContainText(/never finished/);
    // Its files can still be cleared — that is most of what a stalled batch is for.
    await expect(page.getByTestId(`delete-files-${batchId}`)).toBeVisible();
  } finally {
    sql(`UPDATE Submission SET updatedAt = strftime('%s','now')*1000 WHERE batchId='${batchId}';`);
  }
});

test("with no open link the header says so", async ({ page }) => {
  const clientId = sql("SELECT id FROM Client WHERE username='ssh';");
  const open = sql(
    `SELECT group_concat(id) FROM SubmissionRequest WHERE clientId='${clientId}' AND closedAt IS NULL;`
  );
  sql(`UPDATE SubmissionRequest SET closedAt=CURRENT_TIMESTAMP WHERE clientId='${clientId}';`);
  try {
    await page.goto(`/admin/clients/${clientId}`);
    // Nothing can be received at all, which is a different thing from having nothing yet.
    await expect(page.getByTestId("intake-block")).toContainText("no open links");
  } finally {
    if (open) {
      sql(
        `UPDATE SubmissionRequest SET closedAt=NULL WHERE id IN (${open
          .split(",")
          .map((i) => `'${i}'`)
          .join(",")});`
      );
    }
  }
});
