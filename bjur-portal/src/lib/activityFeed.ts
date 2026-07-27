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
      action: `finished ${batch.count} ${batch.count === 1 ? "proxy" : "proxies"}`,
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
