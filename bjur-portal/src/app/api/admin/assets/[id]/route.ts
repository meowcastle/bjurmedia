import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

const INGEST_PORT = process.env.INGEST_PORT ?? "3100";

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
  if (body.weekOf !== undefined) {
    data.weekOf = body.weekOf ? new Date(body.weekOf) : null;
  }

  const updated = await db.asset.update({ where: { id }, data });

  return NextResponse.json({ asset: updated });
}

/**
 * Deletes an asset: removes the underlying master file and any generated
 * proxy/thumbnail, then the DB row. The actual file removal has to happen inside the
 * worker container — web's media mount is read-only by design, same reason uploads
 * route through worker rather than touching MEDIA_ROOT directly from here.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const res = await fetch(`http://worker:${INGEST_PORT}/delete-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ assetId: id, relPath: asset.relPath }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return NextResponse.json(
        { error: data.error ?? "Failed to remove the underlying file(s)." },
        { status: 502 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Couldn't reach the file-cleanup service: ${(err as Error).message.slice(0, 200)}` },
      { status: 502 }
    );
  }

  await db.asset.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
