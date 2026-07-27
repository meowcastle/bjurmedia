import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Manual correction for an auto-matched (or unmatched) social post — currently
 * unlink-only (assetId: null); re-pointing to a different asset is a follow-up. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await req.json();
  const post = await db.socialPost.update({
    where: { id },
    data: { assetId: assetId || null, matchConfidence: assetId ? "manual" : null },
  });

  return NextResponse.json({ post });
}
