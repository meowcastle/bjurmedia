import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * A project's shape is decided once, at creation.
 *
 * That is the whole point of the v3 model — the old five-boolean project could be
 * reshaped after files had landed, leaving assets behind that were ingested under rules
 * nobody could see any more. So the rules worth pinning are the ones that refuse:
 * combinations that cannot exist, and fields that cannot be changed afterwards.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

const CLIENT_WITH_SLACK = "c1"; // SSH — seeded with #ssh-deliveries
const CLIENT_WITHOUT_SLACK = "c4"; // Halcyon Films — no channel

async function create(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post("/api/admin/projects", {
    data: { title: `Spec ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...body },
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

async function cleanUp(request: APIRequestContext, id: string | undefined) {
  if (id) await request.delete(`/api/admin/projects/${id}`);
}

test("film is a type of its own, not a flag on a delivery", async ({ request }) => {
  const { status, body } = await create(request, {
    clientId: CLIENT_WITH_SLACK,
    type: "FILM",
  });
  expect(status, JSON.stringify(body)).toBe(200);
  expect(body.project.type).toBe("FILM");
  await cleanUp(request, body.project?.id);
});

test("a review flag is no longer a thing a delivery can carry", async ({ request }) => {
  // The old shape let any project run a review loop, and the create API had to refuse
  // Calendar+Review with a 400. Review is the FILM type now, so the combination cannot be
  // expressed — a stray `review: true` is simply ignored rather than rejected.
  const { status, body } = await create(request, {
    clientId: CLIENT_WITH_SLACK,
    type: "DELIVERY",
    review: true,
  });
  expect(status, JSON.stringify(body)).toBe(200);
  expect(body.project.type).toBe("DELIVERY");
  expect(body.project.review).toBeUndefined();
  await cleanUp(request, body.project?.id);
});

test("a calendar needs somewhere to post", async ({ request }) => {
  const { status, body } = await create(request, {
    clientId: CLIENT_WITHOUT_SLACK,
    type: "CALENDAR",
  });
  expect(status).toBe(400);
  expect(body.error).toMatch(/Slack channel/i);
  expect(body.error).toMatch(/Integrations/i);
});

test("a calendar is allowed once the client has a channel", async ({ request }) => {
  const { status, body } = await create(request, {
    clientId: CLIENT_WITH_SLACK,
    type: "CALENDAR",
  });
  expect(status, JSON.stringify(body)).toBe(200);
  expect(body.project.type).toBe("CALENDAR");
  await cleanUp(request, body.project?.id);
});

test("type is refused after creation, not silently ignored", async ({ request }) => {
  const { body } = await create(request, { clientId: CLIENT_WITH_SLACK, type: "DELIVERY" });
  const id = body.project.id as string;

  for (const field of [{ type: "CALENDAR" }, { type: "FILM" }]) {
    const res = await request.patch(`/api/admin/projects/${id}`, { data: field });
    expect(res.status(), JSON.stringify(field)).toBe(400);
    expect((await res.json()).error).toMatch(/set at creation/i);
  }

  // The refusals changed nothing: the project is still there and still editable in the
  // ways it is meant to be.
  const after = await request.patch(`/api/admin/projects/${id}`, { data: { title: "Still here" } });
  expect(after.ok(), await after.text()).toBeTruthy();
  await cleanUp(request, id);
});

test("starting with a footage request hands back a send link", async ({ request }) => {
  const { status, body } = await create(request, {
    clientId: CLIENT_WITH_SLACK,
    type: "DELIVERY",
    startRequest: "Berlin raws",
  });
  expect(status, JSON.stringify(body)).toBe(200);
  expect(body.sendPath).toMatch(/^\/send\/[^/]+\/berlin-raws-[A-Za-z0-9_-]{10,}$/);
  await cleanUp(request, body.project?.id);
});
