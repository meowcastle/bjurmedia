import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

/**
 * Whether this viewer gets the watermarked renditions of this project.
 *
 * Staff always see the clean files: the hold is a gate on the client's copy, not a way
 * to stop yourself checking your own work. Everyone else on a held project gets marked
 * everything — poster, proxy and download alike.
 */
export function holdApplies(
  project: { paymentHold: boolean },
  session: Pick<SessionUser, "isAdmin"> | null
) {
  return project.paymentHold && !session?.isAdmin;
}

/**
 * The file a held project hands over when the client hits Download.
 *
 * For video that is the marked *proxy* — the same 1080p rendition the gallery streams.
 * It used to be a second, full-resolution watermarked encode, which was correct and
 * unaffordable: 31 of one 60-clip delivery were 4K, and marking at source resolution put
 * the job at eight hours on the NAS while the client sat looking at an empty gallery. A
 * held download is a file you can watch and approve, not a master you can cut with; the
 * clean master is one invoice away, and nothing about it is touched meanwhile.
 *
 * Stills keep their own full-resolution marked copy. The cost problem was entirely in
 * video re-encodes — a marked JPEG is well under a second — so there is nothing to save
 * by handing back a 960px thumbnail.
 */
export function markedDownloadRelPath(asset: {
  kind: string;
  markedProxyRelPath: string | null;
  markedFileRelPath: string | null;
}) {
  return asset.kind === "VIDEO" ? asset.markedProxyRelPath : asset.markedFileRelPath;
}

/**
 * True once this asset actually has the marked rendition a held project owes the client.
 * Kept separate from holdApplies because the two failure modes are different: the hold
 * being on is a policy, the renditions existing is a fact about the disk, and a route
 * that confuses them serves the clean master by accident.
 */
export function markedReady(asset: {
  markStatus: string;
  kind: string;
  markedProxyRelPath: string | null;
  markedFileRelPath: string | null;
}) {
  return asset.markStatus === "READY" && !!markedDownloadRelPath(asset);
}

/**
 * Queue every client-visible asset in a project for watermarking.
 *
 * Runs when the hold is switched on. Assets still waiting on their proxy get queued here
 * too — marking reads the master, not the proxy, so the two are independent, and
 * generateProxy re-queues idempotently if it finishes afterwards.
 */
export async function queueProjectForMarking(projectId: string) {
  const { count } = await db.asset.updateMany({
    where: { projectId, internal: false, markStatus: { in: ["NONE", "FAILED"] } },
    data: { markStatus: "PENDING" },
  });
  return count;
}

/**
 * How a held project is doing, for the admin's own reassurance before they send the
 * login out: you cannot tell a client "it is all there" until the marking has caught up.
 */
export async function markingProgress(projectId: string) {
  const rows = await db.asset.groupBy({
    by: ["markStatus"],
    where: { projectId, internal: false },
    _count: true,
  });
  const by = Object.fromEntries(rows.map((r) => [r.markStatus, r._count])) as Record<string, number>;
  return {
    ready: by.READY ?? 0,
    pending: (by.PENDING ?? 0) + (by.GENERATING ?? 0),
    failed: by.FAILED ?? 0,
    total: rows.reduce((n, r) => n + r._count, 0),
  };
}
