import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { fileOnlyWhere, isFileOnly } from "@/lib/fileOnly";

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
 * Files a held project lists but does not hand over: raw camera originals and production
 * audio (fileOnly.ts). Everything else on a hold is delivered at once with a mark burned
 * in; these cannot carry one — ffmpeg cannot decode a BRAW, and a "watermark" on a .wav
 * would be a voice-over ruining the take — so the only way to hold them is to not
 * release them. The client sees every clip and how big it is, and the files unlock the
 * moment the hold is lifted.
 *
 * Never queued for marking (queueProjectForMarking, generateProxy) and so never waiting
 * on it: their markStatus stays NONE, and the routes answer 402 for them rather than the
 * 409 "still being prepared" that would otherwise be true forever.
 */
export function lockedUnderHold(asset: { kind: string; name: string }) {
  return isFileOnly(asset);
}

/** The single-download refusal for a locked file, shared so the copy reads the same everywhere. */
export const LOCKED_UNDER_HOLD_MESSAGE = "This file unlocks once payment clears.";

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
  // Raw originals and audio are left at NONE: there is no marked copy to make, and a
  // PENDING row would sit in the mark loop failing on every pass (lockedUnderHold).
  const { count } = await db.asset.updateMany({
    where: { projectId, internal: false, markStatus: { in: ["NONE", "FAILED"] }, NOT: fileOnlyWhere },
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
    // Locked files are never marked, so counting them would leave "ready" short of
    // "total" for good and the admin waiting on a progress bar that cannot finish.
    where: { projectId, internal: false, NOT: fileOnlyWhere },
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
