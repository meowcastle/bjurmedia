import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * A failed encode must stay reachable.
 *
 * The only Retry button in the app lives on the proxy viewer's rail, and the project
 * page used to open that viewer only when proxyStatus was READY — so the assets that
 * needed retrying were the exact ones you could not click. The failure was a dead end
 * you could leave only by editing the database by hand.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");

function sql(q: string) {
  return execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();
}

test("a failed proxy can still be opened and retried", async ({ page }) => {
  const id = sql("SELECT id FROM Asset WHERE projectId='p1' AND kind='VIDEO' LIMIT 1;");
  expect(id, "no video asset to work with").toBeTruthy();
  const before = sql(`SELECT proxyStatus FROM Asset WHERE id='${id}';`);

  try {
    sql(`UPDATE Asset SET proxyStatus='FAILED' WHERE id='${id}';`);

    await page.goto("/admin/projects/p1");
    const tile = page.getByTestId(`file-${id}`);
    await expect(tile).toContainText("Proxy failed");

    // The whole point: the tile opens even though the encode failed.
    await tile.click();
    const viewer = page.getByTestId("admin-proxy-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer).toContainText("The last encode failed");

    // And the rail offers the way out.
    await expect(viewer.getByRole("button", { name: "Retry proxy" })).toBeVisible();
    await viewer.getByRole("button", { name: "Retry proxy" }).click();

    await expect
      .poll(() => sql(`SELECT proxyStatus FROM Asset WHERE id='${id}';`))
      .toBe("PENDING");
  } finally {
    sql(`UPDATE Asset SET proxyStatus='${before}' WHERE id='${id}';`);
  }
});
