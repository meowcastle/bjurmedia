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




test("the row is removed only when nothing is left to remember", async ({ request }) => {
  await request.patch(url, { data: { channel: "#57nyc-content", autoPostSlack: true } });
  expect((await read(request)).exists).toBe(true);

  // No channel override and no auto-post: there is no reason to keep the row.
  await request.patch(url, { data: { channel: "", autoPostSlack: false } });

  const row = await read(request);
  expect(row.exists).toBe(false);
});
