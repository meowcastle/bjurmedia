import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * §9. The dashboard reported state — counts, activity, worker health — but never said
 * what wanted doing. "Needs attention" answers that, from two sources that clear
 * themselves once acted on: galleries expiring inside a fortnight, and retainer files
 * with no delivery week (invisible to both the calendar and the weekly Slack post).
 *
 * Self-clearing is the point. The handoff lists a third source, upload batches "not
 * yet reviewed", which is left out because UploadBatch has no reviewed flag and
 * nothing would set one — those rows would never go away, and a card that cannot go
 * quiet is one people stop reading.
 */
test("the worker's state reads as a stat rather than its own bar", async ({ page }) => {
  await page.goto("/admin");

  // v13: the queue and the worker are two of Today's four numbers.
  await expect(page.getByText("In the queue", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Worker · (online|offline)$/)).toBeVisible();
  // The old standalone bar said this; it should not survive alongside the stat.
  await expect(page.getByText(/ffmpeg worker/)).toHaveCount(0);
});

test("needs attention lists retainer files with no delivery week", async ({ page }) => {
  await page.goto("/admin");

  // v13 calls the section "Needs you" (PortalAdmin13); the stat above it shares the words.
  const card = page.locator(".bj-lab", { hasText: "Needs you" });
  await expect(card).toBeVisible();

  // 57.NYC is the seeded RETAINER client, and its IG Posting project has assets
  // without a weekOf — exactly the case this row exists for.
  const row = page.getByText(/files with no delivery week/).first();
  await expect(row).toBeVisible();

  // The action has to lead somewhere that can fix it, which is the media calendar.
  const action = page.getByRole("link", { name: "Schedule" }).first();
  await expect(action).toHaveAttribute("href", /\/admin\/media\?project=/);
});

test("each attention row offers an action, not just a description", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator(".bj-lab", { hasText: "Needs you" })).toBeVisible();

  // Every row is actionable — a list of problems with no next step is just anxiety.
  // v13 buttons carry the nudging arrow: "Schedule →".
  const rows = page.locator("a", { hasText: /^(Open|Schedule)\s*→?$/ });
  expect(await rows.count()).toBeGreaterThan(0);
});

test("a batch of notes leaves Needs you once answered, or once a newer cut replaces it", async ({ page }) => {
  const { execFileSync } = await import("node:child_process");
  const path = await import("node:path");
  const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
  const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

  const cut = (v: number) =>
    sql(`SELECT r.id FROM Review r JOIN Asset a ON a.id=r.assetId WHERE a.projectId='p2' AND r.version=${v};`);
  const reviewerId = sql("SELECT id FROM Reviewer WHERE projectId='p2' LIMIT 1;");
  const stamp = Date.now();
  const live = `zz-live-${stamp}`;
  const old = `zz-old-${stamp}`;
  const insert = (id: string, reviewId: string, body: string) =>
    sql(
      `INSERT INTO ReviewNote (id, reviewId, reviewerId, body, sentAt, createdAt, updatedAt) VALUES ('${id}','${reviewId}','${reviewerId}','${body}',${stamp},${stamp},${stamp});`
    );
  // Cut 1 is superseded in the seed: a note left on it is history.
  insert(old, cut(1), `old round ${stamp}`);
  insert(live, cut(2), `live round ${stamp}`);

  try {
    await page.goto("/admin");
    await expect(page.getByText(`live round ${stamp}`)).toBeVisible();
    await expect(page.getByText(`old round ${stamp}`)).toHaveCount(0);

    sql(`UPDATE ReviewNote SET outcome='CHANGED', answeredAt=${stamp} WHERE id='${live}';`);
    await page.reload();
    await expect(page.locator(".bj-lab", { hasText: "Needs you" })).toBeVisible();
    await expect(page.getByText(`live round ${stamp}`)).toHaveCount(0);
  } finally {
    sql(`DELETE FROM ReviewNote WHERE id IN ('${live}','${old}');`);
  }
});
