import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * §10 bulk bar: hide a set of assets from the client, or put them back, in one shot.
 *
 * A single explicit `internal` value rather than a per-asset toggle. Toggling a mixed
 * selection is the operation nobody means: half the files come back the wrong way round
 * and there is nothing on screen that predicted which half.
 */
export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetIds, internal } = (await req.json()) as { assetIds: string[]; internal: boolean };
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return NextResponse.json({ error: "No assets selected." }, { status: 400 });
  }
  if (typeof internal !== "boolean") {
    return NextResponse.json({ error: "internal must be true or false." }, { status: 400 });
  }

  const found = await db.asset.count({ where: { id: { in: assetIds } } });
  if (found !== assetIds.length) {
    return NextResponse.json({ error: "One or more assets weren't found." }, { status: 404 });
  }

  await db.asset.updateMany({ where: { id: { in: assetIds } }, data: { internal } });

  return NextResponse.json({ ok: true, updated: assetIds.length });
}
