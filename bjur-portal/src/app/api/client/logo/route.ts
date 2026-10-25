import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { replaceClientLogo } from "@/lib/logos";

/**
 * "Add your logo" from the client's own Settings (v13 §4: shown when the job found
 * nothing). Same path as the studio's "Replace logo", so the upload is saved square on
 * the media volume and locked against the monthly refresh.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  const result = await replaceClientLogo(session.clientId, Buffer.from(await file.arrayBuffer()));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  await db.activity.create({ data: { actor: session.name, action: "added their logo" } }).catch(() => {});
  return NextResponse.json(result);
}
