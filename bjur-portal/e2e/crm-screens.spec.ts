import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The CRM's two screens: the pipeline (deals by stage, moved by drag or by menu, plus the
 * to-do list) and the inbox, where nothing an agent wrote leaves until a person approves it.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

test("a deal is added, then moved by its stage menu", async ({ page }) => {
  const title = `Pipeline spec ${Date.now()}`;
  await page.goto("/admin/pipeline");
  await page.getByRole("button", { name: "+ Deal" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Contact name").fill("Quinn Quote");
  await page.getByLabel("Contact email").fill(`quinn+${Date.now()}@lead.test`);
  await page.getByRole("button", { name: "Add deal" }).click();

  const lead = page.getByTestId("stage-LEAD");
  await expect(lead.getByText(title)).toBeVisible();
  await expect(lead.getByText("Quinn Quote")).toBeVisible();

  const saved = page.waitForResponse((r) => r.url().includes("/api/admin/crm/deals/") && r.request().method() === "PATCH");
  await page.getByLabel(`Stage for ${title}`).selectOption("QUOTED");
  await expect(page.getByTestId("stage-QUOTED").getByText(title)).toBeVisible();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("stage-QUOTED").getByText(title)).toBeVisible();
  // Moving it restarted the follow-up clock.
  expect(sql(`SELECT stage, lastNudgedAt IS NULL FROM Deal WHERE title='${title}';`)).toBe("QUOTED|1");
});

test("a task is added and ticked off", async ({ page }) => {
  const title = `Call Adam ${Date.now()}`;
  await page.goto("/admin/pipeline");
  const tasks = page.getByTestId("tasks");
  await tasks.getByLabel("New task").fill(title);
  await tasks.getByRole("button", { name: "Add" }).click();
  await expect(tasks.getByText(title)).toBeVisible();
  await tasks.getByLabel(`Done: ${title}`).check();
  await expect(tasks.getByText(title)).toHaveCount(0);
});

test("a draft waits in the inbox, is edited, and approved; another is dismissed", async ({ page }) => {
  const stamp = Date.now();
  const id1 = `draft${stamp}a`;
  const id2 = `draft${stamp}b`;
  const now = Date.now();
  sql(
    `INSERT INTO AgentDraft (id, kind, channel, toEmail, subject, body, context, state, createdAt) VALUES
     ('${id1}', 'FOLLOW_UP', 'EMAIL', 'quinn@lead.test', 'Checking in', 'Hi Quinn, just checking in.', '{"trigger":"We sent a quote 6 days ago and have not heard back."}', 'PENDING', ${now}),
     ('${id2}', 'PAYMENT_NUDGE', 'EMAIL', 'olive@client.test', 'Your files', 'Hi Olive.', '{"trigger":"Delivered 8 days ago."}', 'PENDING', ${now});`
  );

  // The dashboard says something is waiting.
  await page.goto("/admin");
  await expect(page.getByTestId("attention-drafts")).toContainText(/drafts? waiting/);

  await page.goto("/admin/inbox");
  const first = page.getByTestId(`draft-${id1}`);
  await expect(first).toContainText("Follow-up");
  // Why it was drafted sits above the draft.
  await expect(first).toContainText("We sent a quote 6 days ago");
  await first.getByLabel("Email").fill("Hi Quinn, edited by a person.");
  await first.getByRole("button", { name: "Approve & send" }).click();
  await expect(page.getByTestId("toast")).toContainText("Approved · sending to quinn@lead.test");
  expect(sql(`SELECT state, body FROM AgentDraft WHERE id='${id1}';`)).toBe("APPROVED|Hi Quinn, edited by a person.");

  await page.getByTestId(`draft-${id2}`).getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId(`recent-${id2}`)).toContainText("dismissed");
  expect(sql(`SELECT state FROM AgentDraft WHERE id='${id2}';`)).toBe("DISMISSED");
});

test("an approved draft cannot be approved twice", async ({ request }) => {
  const id = `draft${Date.now()}c`;
  sql(`INSERT INTO AgentDraft (id, kind, channel, toEmail, body, state, createdAt) VALUES ('${id}', 'FOLLOW_UP', 'EMAIL', 'a@b.test', 'Hi', 'SENT', ${Date.now()});`);
  const res = await request.patch(`/api/admin/crm/drafts/${id}`, { data: { action: "approve" } });
  expect(res.status()).toBe(409);
});
