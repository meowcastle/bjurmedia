import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/projectAccess";
import { holdApplies } from "@/lib/paymentHold";

type AccessKind = "thumb" | "proxy" | "download";

type AssetWithProject = NonNullable<Awaited<ReturnType<typeof loadAsset>>>;

function loadAsset(assetId: string) {
  return db.asset.findUnique({
    where: { id: assetId },
    include: { project: { include: { client: true } } },
  });
}

export type AuthzResult =
  /**
   * `watermark` says this viewer must be served the marked rendition of whatever they
   * asked for, because the project is on a payment hold. It is decided here, next to
   * every other access rule, so no route can serve a clean file by forgetting to ask.
   */
  | { ok: true; asset: AssetWithProject; watermark: boolean }
  | { ok: false; status: number; reason?: string };

/**
 * Gate for /api/assets/[id]/{thumb,proxy,download} per ARCHITECTURE.md §4:
 * session -> same-client ownership -> internal flag -> expiry -> license (download only).
 */
export async function authorizeAssetAccess(
  kind: AccessKind,
  assetId: string,
  session: SessionUser | null
): Promise<AuthzResult> {
  if (!session) return { ok: false, status: 401 };

  const asset = await loadAsset(assetId);
  if (!asset) return { ok: false, status: 404 };

  const access = await getProjectAccess(session, asset.project);

  // Being on a film's review cycle is a grant in its own right, and the only one a
  // reviewer is given — no ProjectMember row comes with it. Without this, fixing the
  // review page only moved the failure one layer down: the screen rendered and the
  // <video> underneath it 404'd, which reads as "the video is broken" and sent us
  // looking at bitrates.
  //
  // Watching only. Someone is put on a review cycle to watch a cut, not to take delivery
  // of it, so `download` is deliberately excluded and stays on the delivery rules.
  const reviewing =
    session.isAdmin ||
    access.allowed ||
    kind === "download" ||
    session.clientId !== asset.project.clientId
      ? null
      : await db.reviewer.findFirst({
          where: { projectId: asset.projectId, userId: session.id, revokedAt: null },
          select: { id: true },
        });

  if (!session.isAdmin) {
    if (!access.allowed && !reviewing) return { ok: false, status: 404 };
    if (asset.internal) return { ok: false, status: 404 };
    if (asset.project.expiresAt && asset.project.expiresAt.getTime() < Date.now()) {
      return { ok: false, status: 410, reason: "expired" };
    }
  }

  if (kind === "download" && !session.isAdmin) {
    if (!access.allowed || access.role === "VIEWER") return { ok: false, status: 403, reason: "role" };
  }

  // A payment hold never refuses the request — the client is meant to be able to take
  // delivery of everything immediately. It changes which file they get.
  return { ok: true, asset, watermark: holdApplies(asset.project, session) };
}
