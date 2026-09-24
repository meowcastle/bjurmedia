import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { newRequestToken, slugify, stateOf, ttlFromNow } from "@/lib/submissionRequests";

/** "+ New link" — names who it is for, and hands back the URL to send them. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await db.client.findUnique({ where: { id }, select: { id: true, name: true, username: true } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Say who the link is for." }, { status: 400 });
  }

  const token = newRequestToken();
  const request = await db.submissionRequest.create({
    data: { clientId: id, name: name.trim(), token, expiresAt: ttlFromNow() },
  });

  await db.activity.create({
    data: { actor: "You", action: `made a send link for "${request.name}" on ${client.name}` },
  });

  return NextResponse.json({
    request,
    sendPath: `/send/${slugify(client.username)}/${slugify(request.name)}-${token}`,
  });
}

/** Every send link for this client, newest first, with the URL each resolves to. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await db.client.findUnique({
    where: { id },
    select: { username: true, submissionRequests: { orderBy: { createdAt: "desc" } } },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    requests: client.submissionRequests.map((r) => ({
      id: r.id,
      name: r.name,
      state: stateOf(r),
      sendPath: `/send/${slugify(client.username)}/${slugify(r.name)}-${r.token}`,
    })),
  });
}
