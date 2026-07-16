import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

const EDITABLE_FIELDS = [
  "connected",
  "webhookUrl",
  "defaultChannel",
  "weeklyDay",
  "weeklyTime",
  "autoWeekly",
  "autoUpload",
  "autoDownload",
  "autoLicense",
] as const;

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }

  const config = await db.slackConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  return NextResponse.json({ config });
}
