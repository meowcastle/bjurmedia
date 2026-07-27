import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidHexColor } from "@/lib/color";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if ("accentColor" in body) {
    const { accentColor } = body as { accentColor: string | null };
    if (accentColor !== null && !isValidHexColor(accentColor)) {
      return NextResponse.json({ error: "Invalid accent color." }, { status: 400 });
    }
    const client = await db.client.update({ where: { id }, data: { accentColor } });
    return NextResponse.json({ client });
  }

  if ("logoUrl" in body) {
    const { logoUrl } = body as { logoUrl: string | null };
    if (logoUrl !== null) {
      try {
        new URL(logoUrl);
      } catch {
        return NextResponse.json({ error: "Invalid logo URL." }, { status: 400 });
      }
    }
    const client = await db.client.update({ where: { id }, data: { logoUrl } });
    return NextResponse.json({ client });
  }

  const { status } = body;
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
