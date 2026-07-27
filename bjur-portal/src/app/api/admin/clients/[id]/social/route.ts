import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform, externalId, handle, accessToken } = await req.json();
  if (platform !== "INSTAGRAM" && platform !== "YOUTUBE") {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  if (!externalId?.trim()) {
    await db.socialAccount.deleteMany({ where: { clientId, platform } });
    return NextResponse.json({ ok: true });
  }

  const account = await db.socialAccount.upsert({
    where: { clientId_platform: { clientId, platform } },
    create: {
      clientId,
      platform,
      externalId: externalId.trim(),
      handle: handle?.trim() ?? "",
      accessToken: accessToken?.trim() || null,
    },
    update: {
      externalId: externalId.trim(),
      handle: handle?.trim() ?? "",
      ...(accessToken !== undefined ? { accessToken: accessToken?.trim() || null } : {}),
    },
  });

  return NextResponse.json({ account });
}
