import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.internal === "boolean") data.internal = body.internal;
  if (typeof body.licensable === "boolean") data.licensable = body.licensable;
  if (body.basePrice !== undefined) {
    data.basePrice = body.basePrice === null ? null : Math.max(0, Math.round(Number(body.basePrice)));
  }
  if (body.retry === true) {
    data.proxyStatus = "PENDING";
  }

  const updated = await db.asset.update({ where: { id }, data });

  return NextResponse.json({ asset: updated });
}
