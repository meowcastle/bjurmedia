import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The studio half of the loop.
 *
 * The release gate gets the most attention because it is the promise the whole thing
 * rests on: reviewers are told every note gets answered in the next cut's email, and the
 * only thing making that true is the server refusing to send until they are.
 */
const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

test.describe("studio", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("studio mode shows sent notes and never a draft", async ({ page }) => {
    await page.goto("/admin/projects/p2/review");
    const screen = page.getByTestId("review-screen");
    await expect(screen).toBeVisible();
    // The seeded draft body must not be anywhere on a staff screen.
    await expect(screen).not.toContainText("nobody but its author");
    // SMPTE, not m:ss — a note has to land on a frame in an edit.
    await expect(page.getByTestId("smpte")).toHaveText(/\d\d:\d\d:\d\d:\d\d/);
  });

  test("markers export in all three formats", async ({ request }) => {
    const cutId = sql(
      "SELECT r.id FROM Review r JOIN Asset a ON a.id=r.assetId WHERE a.projectId='p2' ORDER BY r.version LIMIT 1;"
    );
    for (const [fmt, marker] of [
      ["csv", "Marker Name,Description"],
      ["edl", "FCM: NON-DROP FRAME"],
      ["txt", ":"],
    ] as const) {
      const res = await request.get(`/api/admin/reviews/${cutId}/markers?format=${fmt}`);
      expect(res.status(), fmt).toBe(200);
      expect(await res.text(), fmt).toContain(marker);
    }
  });

  test("a note kept as is must say why", async ({ request }) => {
    const cutId = sql(
      "SELECT r.id FROM Review r JOIN Asset a ON a.id=r.assetId WHERE a.projectId='p2' ORDER BY r.version LIMIT 1;"
    );
    const noteId = sql(`SELECT id FROM ReviewNote WHERE reviewId='${cutId}' AND sentAt IS NOT NULL LIMIT 1;`);
    const before = sql(`SELECT COALESCE(response,'') FROM ReviewNote WHERE id='${noteId}';`);

    const res = await request.patch(`/api/admin/reviews/${cutId}/notes/${noteId}`, {
      data: { outcome: "KEPT", response: "" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/why it stays/i);

    sql(`UPDATE ReviewNote SET response='${before.replace(/'/g, "''")}' WHERE id='${noteId}';`);
  });

  test("an unanswered round blocks the next cut", async ({ request }) => {
    // A third, unsent cut, with the current round's note deliberately unanswered.
    const assetId = sql("SELECT id FROM Asset WHERE projectId='p2' AND kind='VIDEO' LIMIT 1;");
    const cut2 = sql(
      "SELECT r.id FROM Review r JOIN Asset a ON a.id=r.assetId WHERE a.projectId='p2' AND r.version=2;"
    );
    const reviewerId = sql("SELECT id FROM Reviewer WHERE projectId='p2' LIMIT 1;");
    const cut3 = `zz-cut3-${Date.now()}`;
    const note = `zz-note-${Date.now()}`;

    sql(
      `INSERT INTO Review (id, assetId, version, state, createdAt) VALUES ('${cut3}','${assetId}',3,'PENDING',CURRENT_TIMESTAMP);`
    );
    sql(
      `INSERT INTO ReviewNote (id, reviewId, reviewerId, body, sentAt, createdAt, updatedAt) VALUES ('${note}','${cut2}','${reviewerId}','blocking note',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`
    );

    try {
      const blocked = await request.post(`/api/admin/reviews/${cut3}/release`);
      expect(blocked.status()).toBe(409);
      expect((await blocked.json()).error).toMatch(/answer \d+ more note/i);

      // Answer it, and the gate opens.
      await request.patch(`/api/admin/reviews/${cut2}/notes/${note}`, {
        data: { outcome: "CHANGED", response: "Done." },
      });
      const ok = await request.post(`/api/admin/reviews/${cut3}/release`);
      expect(ok.status()).toBe(200);
      expect(sql(`SELECT sentAt IS NOT NULL FROM Review WHERE id='${cut3}';`)).toBe("1");
      // Releasing supersedes the round it answers.
      expect(sql(`SELECT state FROM Review WHERE id='${cut2}';`)).toBe("SUPERSEDED");
    } finally {
      sql(`DELETE FROM ReviewNote WHERE id='${note}';`);
      sql(`DELETE FROM Review WHERE id='${cut3}';`);
      sql(`UPDATE Review SET state='PENDING', supersededAt=NULL WHERE id='${cut2}';`);
    }
  });
});

test.describe("guest", () => {
  test("the link asks for a name once, then plays the cut", async ({ page }) => {
    const token = sql("SELECT token FROM Reviewer WHERE projectId='p2' AND kind='GUEST';");
    const before = sql(`SELECT name FROM Reviewer WHERE token='${token}';`);
    sql(`UPDATE Reviewer SET name='' WHERE token='${token}';`);

    try {
      await page.goto(`/r/${token}`);
      await expect(page.getByTestId("guest-name")).toBeVisible();
      await page.getByTestId("guest-name").fill("Tom Reyes");
      await page.getByTestId("guest-continue").click();
      await expect(page.getByTestId("review-screen")).toBeVisible();
      // And never asked again.
      await page.reload();
      await expect(page.getByTestId("guest-name")).toHaveCount(0);
    } finally {
      sql(`UPDATE Reviewer SET name='${before.replace(/'/g, "''")}' WHERE token='${token}';`);
    }
  });

  test("a revoked link stops existing", async ({ page }) => {
    const token = sql("SELECT token FROM Reviewer WHERE projectId='p2' AND kind='GUEST';");
    sql(`UPDATE Reviewer SET revokedAt=CURRENT_TIMESTAMP WHERE token='${token}';`);
    try {
      const res = await page.goto(`/r/${token}`);
      expect(res?.status()).toBe(404);
    } finally {
      sql(`UPDATE Reviewer SET revokedAt=NULL WHERE token='${token}';`);
    }
  });

  test("a made-up token is a 404, not a hint", async ({ page }) => {
    const res = await page.goto(`/r/${"a".repeat(64)}`);
    expect(res?.status()).toBe(404);
  });
});
