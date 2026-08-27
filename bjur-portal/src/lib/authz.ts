import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/projectAccess";

type AccessKind = "thumb" | "proxy" | "download";

type AssetWithProject = NonNullable<Awaited<ReturnType<typeof loadAsset>>>;

function loadAsset(assetId: string) {
  return db.asset.findUnique({
    where: { id: assetId },
    include: { project: { include: { client: true } } },
  });
}

export type AuthzResult =
  | { ok: true; asset: AssetWithProject }
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

  if (!session.isAdmin) {
    if (!access.allowed) return { ok: false, status: 404 };
    if (asset.internal) return { ok: false, status: 404 };
    if (asset.project.expiresAt && asset.project.expiresAt.getTime() < Date.now()) {
      return { ok: false, status: 410, reason: "expired" };
    }
  }

  if (kind === "download" && !session.isAdmin) {
    if (!access.allowed || access.role === "VIEWER") return { ok: false, status: 403, reason: "role" };

    if (asset.licensable) {
      const license = await db.license.findFirst({
        where: { assetId: asset.id, clientId: session.clientId ?? undefined },
      });
      if (!license) return { ok: false, status: 403, reason: "license_required" };
    }
  }

  return { ok: true, asset };
}
