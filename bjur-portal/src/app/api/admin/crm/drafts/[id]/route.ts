import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * The approval queue's three actions (CRM.md §4): approve (optionally with edits, saved
 * first), or dismiss. Approval only marks the draft; the worker's sender is what sends it.
 * Only a pending draft can be acted on — a sent one is history.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const draft = await db.agentDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (draft.state !== "PENDING") {
    return NextResponse.json({ error: "This draft has already been dealt with." }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    subject?: unknown;
    body?: unknown;
    toEmail?: unknown;
  };
  const now = new Date();
  if (body.action === "dismiss") {
    await db.agentDraft.update({ where: { id }, data: { state: "DISMISSED", dismissedAt: now } });
    await db.activity.create({ data: { actor: "You", action: `dismissed a drafted ${draft.kind.toLowerCase().replace("_", " ")}` } });
    return NextResponse.json({ state: "DISMISSED" });
  }
  if (body.action !== "approve") return NextResponse.json({ error: "Approve or dismiss." }, { status: 400 });

  const text = typeof body.body === "string" ? body.body.trim() : draft.body;
  if (!text) return NextResponse.json({ error: "The email is empty." }, { status: 400 });
  const to = typeof body.toEmail === "string" ? body.toEmail.trim().toLowerCase() : draft.toEmail;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "It needs an address to go to." }, { status: 400 });
  }
  await db.agentDraft.update({
    where: { id },
    data: {
      state: "APPROVED",
      approvedAt: now,
      body: text,
      toEmail: to,
      subject: typeof body.subject === "string" ? body.subject.trim() : draft.subject,
    },
  });
  await db.activity.create({ data: { actor: "You", action: `approved "${draft.subject ?? draft.kind}" to ${to}` } });
  return NextResponse.json({ state: "APPROVED" });
}
