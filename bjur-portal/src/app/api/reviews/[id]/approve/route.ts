import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveReviewer } from "@/lib/reviewAccess";
import { approveCut, unapproveCut } from "@/lib/reviews";
import { notifyApproved } from "@/lib/reviewMail";

/** Approve the current cut. Owner seats only — approveCut re-checks that itself. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cut = await db.review.findUnique({
    where: { id },
    include: { asset: { select: { projectId: true } } },
  });
  if (!cut) return new Response(null, { status: 404 });

  const reviewer = await resolveReviewer(req, cut.asset.projectId);
  if (!reviewer) return new Response(null, { status: 403 });

  const result = await approveCut(id, reviewer.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error === "not-open" ? "That cut is not open." : "Only an owner can approve." },
      { status: result.error === "not-open" ? 409 : 403 }
    );
  }

  await db.activity.create({
    data: { actor: reviewer.name, action: `approved cut ${cut.version}` },
  });
  await notifyApproved(id, reviewer.id).catch(() => {});

  return NextResponse.json({ ok: true });
}

/** Undo, while this is still the latest cut. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cut = await db.review.findUnique({
    where: { id },
    include: { asset: { select: { projectId: true } } },
  });
  if (!cut) return new Response(null, { status: 404 });

  const reviewer = await resolveReviewer(req, cut.asset.projectId);
  if (!reviewer) return new Response(null, { status: 403 });

  const undone = await unapproveCut(id, reviewer.id);
  if (!undone) return NextResponse.json({ error: "Too late to undo." }, { status: 409 });

  return NextResponse.json({ ok: true });
}
