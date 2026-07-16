import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assetId } = await params;
  const session = await getSessionUser();
  if (!session || !session.clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await db.favorite.findUnique({
    where: { userId_assetId: { userId: session.id, assetId } },
  });

  if (existing) {
    await db.favorite.delete({ where: { userId_assetId: { userId: session.id, assetId } } });
    return NextResponse.json({ favorite: false });
  }

  await db.favorite.create({ data: { userId: session.id, assetId } });
  return NextResponse.json({ favorite: true });
}
