import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { refreshClientLogo, replaceClientLogo, setClientLogoSources } from "@/lib/logos";

/**
 * The client row menu's logo actions (v13 handoff §4). A thin layer over src/lib/logos,
 * which a server component or action can also call directly.
 *
 *   POST  multipart/form-data, field "file"  → "Replace logo": saved and locked
 *   POST  { "action": "refresh" }            → "Refresh logo": unlocked, job runs next tick
 *   PATCH { websiteDomain?, instagramHandle?, youtubeHandle? } → where the job looks
 */
async function guard(id: string) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = await db.client.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return client;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await guard(id);
  if (client instanceof NextResponse) return client;

  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
    const result = await replaceClientLogo(id, Buffer.from(await file.arrayBuffer()));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await db.activity.create({ data: { actor: "You", action: `replaced the logo for ${client.name}` } });
    return NextResponse.json(result);
  }

  const body = await req.json().catch(() => ({}));
  if (body?.action === "refresh") {
    await refreshClientLogo(id);
    return NextResponse.json({ ok: true, queued: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await guard(id);
  if (client instanceof NextResponse) return client;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  const input: Parameters<typeof setClientLogoSources>[1] = {};
  for (const key of ["websiteDomain", "instagramHandle", "youtubeHandle"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v !== null && (typeof v !== "string" || v.length > 200)) {
      return NextResponse.json({ error: `${key} must be text.` }, { status: 400 });
    }
    input[key] = v as string | null;
  }
  return NextResponse.json(await setClientLogoSources(id, input));
}
