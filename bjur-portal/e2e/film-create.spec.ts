import { test, expect, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Creating a Film project, and the reviewers that come with it.
 *
 * The seating is the part worth a test: a Film project with no Reviewer rows is a review
 * screen nobody can open, and the failure is silent — the project looks fine until the
 * first cut goes out to an empty list.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

async function create(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post("/api/admin/projects", {
    data: { title: `Film ${Date.now()}`, ...body },
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

test("a film project seats every client seat, whatever their role", async ({ request }) => {
  const clientId = sql("SELECT id FROM Client WHERE username='ssh';");
  const seats = Number(sql(`SELECT COUNT(*) FROM ClientMember WHERE clientId='${clientId}';`));
  expect(seats).toBeGreaterThan(1);

  const { status, body } = await create(request, { clientId, type: "FILM" });
  expect(status, JSON.stringify(body)).toBe(200);
  const id = body.project.id;

  try {
    expect(body.project.type).toBe("FILM");
    // Every seat, not only owners: a viewer who cannot download still has notes.
    expect(Number(sql(`SELECT COUNT(*) FROM Reviewer WHERE projectId='${id}' AND kind='SEAT';`))).toBe(seats);
  } finally {
    await request.delete(`/api/admin/projects/${id}`);
  }
});

test("guests become tokenized reviewers with no account", async ({ request }) => {
  const clientId = sql("SELECT id FROM Client WHERE username='ssh';");
  const { status, body } = await create(request, {
    clientId,
    type: "FILM",
    guests: [{ email: "director@example.com" }, { email: "label@example.com" }],
  });
  expect(status, JSON.stringify(body)).toBe(200);
  const id = body.project.id;

  try {
    const guests = sql(
      `SELECT COUNT(*) FROM Reviewer WHERE projectId='${id}' AND kind='GUEST' AND token IS NOT NULL AND userId IS NULL;`
    );
    expect(Number(guests)).toBe(2);

    // Hex, not base64url — a hyphen in a token broke a URL split once already.
    const token = sql(`SELECT token FROM Reviewer WHERE projectId='${id}' AND kind='GUEST' LIMIT 1;`);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  } finally {
    await request.delete(`/api/admin/projects/${id}`);
  }
});

test("a delivery gets no reviewers at all", async ({ request }) => {
  const clientId = sql("SELECT id FROM Client WHERE username='ssh';");
  const { body } = await create(request, { clientId, type: "DELIVERY", guests: [{ email: "x@y.com" }] });
  const id = body.project.id;
  try {
    expect(Number(sql(`SELECT COUNT(*) FROM Reviewer WHERE projectId='${id}';`))).toBe(0);
  } finally {
    await request.delete(`/api/admin/projects/${id}`);
  }
});

test("the create sheet offers Film, and asks for guests when it is picked", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByRole("link", { name: /SSH/ }).first().click();
  await page.waitForURL(/\/admin\/clients\/.+/);
  await page.getByRole("button", { name: /New project/i }).click();

  // Three types now, and the old review toggle is gone — review is the Film type.
  await expect(page.getByRole("button", { name: /^Film/ })).toBeVisible();
  await expect(page.getByTestId("add-review")).toHaveCount(0);

  // The reviewers block is Film-only.
  await expect(page.getByTestId("reviewers-block")).toHaveCount(0);
  await page.getByRole("button", { name: /^Film/ }).click();
  await expect(page.getByTestId("reviewers-block")).toBeVisible();
  await page.getByTestId("guest-emails").fill("a@b.com, c@d.com");
  await expect(page.getByTestId("reviewers-block")).toContainText("2 guests");
});

test("the admin project page shows cuts and reviewers for a film", async ({ page }) => {
  await page.goto("/admin/projects/p2");
  const block = page.getByTestId("film-block");
  await expect(block).toBeVisible();
  await expect(block).toContainText("Cut 2");
  await expect(block).toContainText("Tom Reyes");
  await expect(block).toContainText("Guest link");
  // A draft is counted, never quoted.
  await expect(block).not.toContainText("nobody but its author");
  await expect(page.getByTestId("open-review")).toBeVisible();
});

test("a delivery project has no film block", async ({ page }) => {
  await page.goto("/admin/projects/p1");
  await expect(page.getByTestId("film-block")).toHaveCount(0);
});
