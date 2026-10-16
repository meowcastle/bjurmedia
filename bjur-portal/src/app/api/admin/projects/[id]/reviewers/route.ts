import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addGuestReviewer } from "@/lib/projects";
import { notifyCutReady } from "@/lib/reviewMail";

/**
 * Adds a guest reviewer to a Film project after it was created. Until this existed the
 * only way to bring in a director or a label was the New project sheet.
 *
 * Someone added after a cut has gone out would otherwise wait for the next one, so if a
 * cut is already released they get that cut's email now — the same mail, with their own
 * link — and nobody else is mailed again.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, include: { client: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (project.type !== "FILM") {
    return NextResponse.json({ error: "Only Film projects have reviewers." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; role?: unknown };
  const reviewer = await addGuestReviewer(project.id, {
    email: typeof body.email === "string" ? body.email : "",
    role: typeof body.role === "string" ? body.role : undefined,
  });
  if (!reviewer) return NextResponse.json({ error: "That is not an email address." }, { status: 400 });

  const current = await db.review.findFirst({
    where: { asset: { projectId: project.id }, sentAt: { not: null } },
    orderBy: { version: "desc" },
    select: { id: true, version: true },
  });
  const mailed = current ? (await notifyCutReady(current.id, {}, [reviewer.id])).sent > 0 : false;

  await db.activity.create({
    data: {
      actor: "You",
      action: `added ${reviewer.email} as a guest reviewer on "${project.title}"${
        mailed && current ? ` and sent them cut ${current.version}` : ""
      }`,
    },
  });

  return NextResponse.json({
    reviewer: { id: reviewer.id, email: reviewer.email },
    mailedCut: mailed && current ? current.version : null,
  });
}
