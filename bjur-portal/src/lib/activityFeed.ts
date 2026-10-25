type RawActivity = { id: string; actor: string; action: string; createdAt: Date };

const ROUTINE_PROXY_PREFIX = "finished proxy for";

/**
 * Collapses consecutive routine "Worker finished proxy for X" rows into a
 * single summary row, so a burst of proxy completions doesn't bury the
 * business-relevant events (downloads, licenses, new clients) around it.
 * Worker rows that aren't routine completions — proxy failures, discarded
 * WIP files, unmatched inbox files — are left alone; those are exactly the
 * kind of thing this feed exists to surface, not noise to hide.
 */
export function summarizeActivity(rows: RawActivity[]): RawActivity[] {
  const result: RawActivity[] = [];
  let batch: { count: number; latest: Date } | null = null;

  function flush() {
    if (!batch) return;
    result.push({
      id: `proxy-batch-${batch.latest.getTime()}`,
      actor: "Worker",
      action: `finished ${batch.count} ${batch.count === 1 ? "preview" : "previews"}`,
      createdAt: batch.latest,
    });
    batch = null;
  }

  for (const a of rows) {
    const isRoutineProxy = a.actor === "Worker" && a.action.startsWith(ROUTINE_PROXY_PREFIX);
    if (isRoutineProxy) {
      if (!batch) batch = { count: 1, latest: a.createdAt };
      else batch.count += 1;
      continue;
    }
    flush();
    result.push(a);
  }
  flush();

  return result;
}

/**
 * The feed in the distill vocabulary (v13 §3.5). Rows are stored as they were written,
 * some of them long before the words changed, so the wording is settled here at display
 * time rather than by rewriting history: "added" not "auto-ingested", "preview" not
 * "proxy", "while payment is pending" not "while awaiting payment", and file names in
 * curly quotes as on the boards.
 */
export function plainActivity(action: string): string {
  return action
    .replace(/^auto-ingested "([^"]*)" in /, 'added "$1" to ')
    .replace(/while awaiting payment/g, "while payment is pending")
    .replace(/^Proxy generation failed for /, "Preview failed for ")
    .replace(/\bfinished proxies for\b/g, "finished previews for")
    .replace(/\bfinished proxy for\b/g, "finished the preview for")
    .replace(/"([^"]*)"/g, "\u201c$1\u201d");
}
