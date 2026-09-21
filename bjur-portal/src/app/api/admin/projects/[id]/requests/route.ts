import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { newRequestToken, slugify, stateOf, ttlFromNow } from "@/lib/submissionRequests";

/** "+ Request footage" — names what you want, and hands back the link to send. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Say what they are sending." }, { status: 400 });
  }

  const token = newRequestToken();
  const request = await db.submissionRequest.create({
    data: { projectId: id, name: name.trim(), token, expiresAt: ttlFromNow() },
  });

  await db.activity.create({
    data: { actor: "You", action: `asked for "${request.name}" on ${project.title}` },
  });

  return NextResponse.json({
    request,
    sendPath: `/send/${slugify(project.title)}/${slugify(request.name)}-${token}`,
  });
}

/** Every request on this project, newest first, with the link each one resolves to. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({
    where: { id },
    select: { title: true, submissionRequests: { orderBy: { createdAt: "desc" } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    requests: project.submissionRequests.map((r) => ({
      id: r.id,
      name: r.name,
      state: stateOf(r),
      sendPath: `/send/${slugify(project.title)}/${slugify(r.name)}-${r.token}`,
    })),
  });
}
