import { test, expect, request as pwRequest } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Portal uploads are a door the studio opens, one client at a time.
 *
 * Moving intake to the client removed the old gate along with the project it hung off,
 * which handed every seat on every account an upload page nobody had authorised. Off is
 * the default now, and "off" has to mean the routes refuse — not merely that the tab is
 * hidden, which is a suggestion rather than a rule.
 */
const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();
const setSwitch = (on: boolean) =>
  sql(`UPDATE Client SET footageUploads=${on ? 1 : 0} WHERE username='ssh';`);

test.describe("switched off", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("the tab is absent and the page does not exist", async ({ page }) => {
    setSwitch(false);
    try {
      await page.goto("/");
      await expect(page.getByTestId("nav-send")).toHaveCount(0);
      const res = await page.goto("/send");
      expect(res?.status()).toBe(404);
    } finally {
      setSwitch(true);
    }
  });

  test("and the routes refuse, not just the nav", async ({ request }) => {
    setSwitch(false);
    try {
      // Hiding a tab is a suggestion. This is the rule.
      const batch = await request.post("/api/intake/upload-batches", { data: { name: "Sneaky" } });
      expect(batch.status()).toBe(403);
      const list = await request.get("/api/intake/submissions");
      expect(list.status()).toBe(403);
    } finally {
      setSwitch(true);
    }
  });
});

test.describe("switched on", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("the tab names the client and the page works", async ({ page }) => {
    setSwitch(true);
    await page.goto("/");
    await expect(page.getByTestId("nav-send")).toContainText("Upload footage");
    await page.goto("/send");
    // Whose footage, not just "send us" — the portal serves several clients.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Upload footage for");
  });
});

test.describe("admin", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("the studio can open and close it", async ({ page, baseURL }) => {
    setSwitch(false);
    const clientId = sql("SELECT id FROM Client WHERE username='ssh';");
    const api = await pwRequest.newContext({ baseURL: baseURL!, storageState: "e2e/.auth/admin.json" });

    try {
      await page.goto(`/admin/clients/${clientId}`);
      const toggle = page.getByTestId("toggle-portal-uploads");
      await expect(toggle).toContainText("Off");
      await toggle.click();
      await expect(toggle).toContainText("On");
      expect(sql("SELECT footageUploads FROM Client WHERE username='ssh';")).toBe("1");

      // A send link is a separate door — closing one must not close the other.
      const res = await api.post(`/api/admin/clients/${clientId}/requests`, {
        data: { name: `Switch spec ${Date.now()}` },
      });
      expect(res.ok()).toBeTruthy();
      const reqId = (await res.json()).request.id as string;
      await api.patch(`/api/admin/clients/${clientId}`, { data: { footageUploads: false } });
      expect(sql(`SELECT closedAt IS NULL FROM SubmissionRequest WHERE id='${reqId}';`)).toBe("1");
      sql(`DELETE FROM SubmissionRequest WHERE id='${reqId}';`);
    } finally {
      setSwitch(true);
      await api.dispose();
    }
  });
});
