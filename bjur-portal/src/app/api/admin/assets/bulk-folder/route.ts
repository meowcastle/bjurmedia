import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Moves a set of assets into a folder (or back to Unsorted, folderId: null) in one shot. */
export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetIds, folderId } = (await req.json()) as { assetIds: string[]; folderId: string | null };
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return NextResponse.json({ error: "No assets selected." }, { status: 400 });
  }

  const assets = await db.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, projectId: true } });
  if (assets.length !== assetIds.length) {
    return NextResponse.json({ error: "One or more assets weren't found." }, { status: 404 });
  }
  const projectIds = new Set(assets.map((a) => a.projectId));
  if (projectIds.size > 1) {
    return NextResponse.json({ error: "Assets must all belong to the same project." }, { status: 400 });
  }

  if (folderId !== null) {
    const folder = await db.folder.findUnique({ where: { id: folderId } });
    if (!folder || !projectIds.has(folder.projectId)) {
      return NextResponse.json({ error: "Invalid folder." }, { status: 400 });
    }
  }

  await db.asset.updateMany({ where: { id: { in: assetIds } }, data: { folderId } });

  return NextResponse.json({ ok: true });
}
