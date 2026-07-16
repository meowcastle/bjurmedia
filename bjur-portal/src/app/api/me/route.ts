import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.email === "string") data.email = body.email.toLowerCase();
  if (typeof body.notifyDelivery === "boolean") data.notifyDelivery = body.notifyDelivery;
  if (typeof body.notifyExpiry === "boolean") data.notifyExpiry = body.notifyExpiry;

  const user = await db.user.update({ where: { id: session.id }, data });
  return NextResponse.json({
    name: user.name,
    email: user.email,
    notifyDelivery: user.notifyDelivery,
    notifyExpiry: user.notifyExpiry,
  });
}
