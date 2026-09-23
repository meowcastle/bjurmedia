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

/**
 * Retry must refuse to re-arm work that is already queued or running.
 *
 * The button used to disable only on GENERATING. A press writes PENDING, so the moment
 * you clicked it the button re-enabled itself over a job the worker had already claimed —
 * and on a 22 GB ProRes master that reads as "nothing is happening", which invites more
 * pressing. The rail now shows the encoder's real position instead.
 */
test("an encode in flight shows progress instead of a Retry button", async ({ page }) => {
  const id = sql("SELECT id FROM Asset WHERE projectId='p1' AND kind='VIDEO' LIMIT 1;");
  const before = sql(`SELECT proxyStatus FROM Asset WHERE id='${id}';`);

  try {
    sql(`UPDATE Asset SET proxyStatus='GENERATING', proxyProgress=42 WHERE id='${id}';`);
    await page.goto("/admin/projects/p1");
    await page.getByTestId(`file-${id}`).click();

    const viewer = page.getByTestId("admin-proxy-viewer");
    await expect(viewer.getByTestId("encode-progress")).toContainText("Encoding 42%");
    await expect(viewer.getByRole("button", { name: /Retry proxy|Regenerate proxy/ })).toHaveCount(0);

    // Queued counts too — that is the state a stray press leaves behind.
    sql(`UPDATE Asset SET proxyStatus='PENDING', proxyProgress=NULL WHERE id='${id}';`);
    await page.reload();
    await page.getByTestId(`file-${id}`).click();
    await expect(viewer.getByTestId("encode-progress")).toContainText("Queued for encoding");
    await expect(viewer.getByRole("button", { name: /Retry proxy|Regenerate proxy/ })).toHaveCount(0);
  } finally {
    sql(`UPDATE Asset SET proxyStatus='${before}', proxyProgress=NULL WHERE id='${id}';`);
  }
});
