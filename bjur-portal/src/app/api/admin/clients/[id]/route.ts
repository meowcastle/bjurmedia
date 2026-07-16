import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status } = await req.json();
  if (status !== "ACTIVE" && status !== "DISABLED") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const client = await db.client.update({ where: { id }, data: { status } });

  if (status === "DISABLED") {
    await db.session.deleteMany({ where: { user: { clientId: id } } });
  }

  await db.activity.create({
    data: {
      actor: "You",
      action: `${status === "DISABLED" ? "disabled" : "re-enabled"} client "${client.name}"`,
    },
  });

  return NextResponse.json({ client });
}
