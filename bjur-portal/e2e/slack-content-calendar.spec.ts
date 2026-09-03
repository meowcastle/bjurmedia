import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// c2 = 57.NYC, the client whose weekly IG calendar this feature exists for.
const CLIENT_ID = "c2";
const url = `/api/admin/slack/channels/${CLIENT_ID}`;

type Row = {
  exists: boolean;
  channel: string;
  autoPostSlack: boolean;
  autoPostDay: number;
  autoPostHour: number;
};

/**
 * The per-client Slack row started life carrying only a channel-name override, so
 * clearing the channel deleted it outright. It now also carries that client's
 * content-calendar schedule, which turns that shortcut into data loss: blanking a
 * channel name would silently switch the client's weekly post off, with nothing in
 * the UI to say it had happened.
 *
 * These assert the stored row itself rather than the rendered page — the page
 * contains the same labels for every client whether or not anything is configured,
 * so a page-text assertion passes just as happily against the broken version.
 */
test.afterEach(async ({ request }) => {
  // Leave no row behind; other specs read this table.
  await request.patch(url, { data: { channel: "", autoPostSlack: false } });
});

async function read(request: import("@playwright/test").APIRequestContext): Promise<Row> {
  const res = await request.get(url);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Row;
}

test("clearing the channel keeps the client's posting schedule", async ({ request }) => {
  await request.patch(url, {
    data: { channel: "#57nyc-content", autoPostSlack: true, autoPostDay: 3, autoPostHour: 9 },
  });

  // Blank the channel only. Before the fix this deleted the row, schedule included.
  await request.patch(url, { data: { channel: "" } });

  const row = await read(request);
  expect(row.exists).toBe(true);
  expect(row.channel).toBe("");
  expect(row.autoPostSlack).toBe(true);
  expect(row.autoPostDay).toBe(3);
  expect(row.autoPostHour).toBe(9);
});

test("a field left out of the request is not reset", async ({ request }) => {
  await request.patch(url, {
    data: { channel: "#57nyc-content", autoPostSlack: true, autoPostDay: 3, autoPostHour: 9 },
  });

  // Change only the hour; everything else must survive untouched.
  await request.patch(url, { data: { autoPostHour: 17 } });

  const row = await read(request);
  expect(row.autoPostHour).toBe(17);
  expect(row.autoPostDay).toBe(3);
  expect(row.channel).toBe("#57nyc-content");
  expect(row.autoPostSlack).toBe(true);
});

test("out-of-range day and hour are clamped, not stored raw", async ({ request }) => {
  // getDay() returns 0-6 and hours are 0-23. An out-of-range value would produce a
  // schedule that can never match, i.e. a post that silently never goes out.
  await request.patch(url, {
    data: { channel: "#57nyc-content", autoPostSlack: true, autoPostDay: 99, autoPostHour: -4 },
  });

  const row = await read(request);
  expect(row.autoPostDay).toBe(6);
  expect(row.autoPostHour).toBe(0);
});

test("the row is removed only when nothing is left to remember", async ({ request }) => {
  await request.patch(url, { data: { channel: "#57nyc-content", autoPostSlack: true } });
  expect((await read(request)).exists).toBe(true);

  // No channel override and no auto-post: there is no reason to keep the row.
  await request.patch(url, { data: { channel: "", autoPostSlack: false } });

  const row = await read(request);
  expect(row.exists).toBe(false);
});
