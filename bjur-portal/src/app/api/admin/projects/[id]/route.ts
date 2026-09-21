import { rm } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { inboxDirFor } from "@/lib/projects";
import { queueProjectForMarking } from "@/lib/paymentHold";
import { sendPaymentReleaseReceipt } from "@/lib/clientMail";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await db.project.findUnique({ where: { id }, include: { client: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.deliveredAt !== undefined) {
    data.deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : null;
  }
  // The three service switches. A project is defined by what it does, so these are
  // per-project rather than a property of the client that owns it.
  // What a project *is* is fixed at creation. A project that changes shape after files
  // have landed leaves assets behind that were ingested under the old rules, and no
  // screen can say which — so these are refused rather than quietly ignored.
  for (const fixed of ["type", "review"] as const) {
    if (body[fixed] !== undefined) {
      return NextResponse.json({ error: "Set at creation" }, { status: 400 });
    }
  }

  // Payment hold is the one switch that still flips, because it describes where the job
  // has got to rather than what the job is.
  if (body.paymentHold !== undefined) {
    if (typeof body.paymentHold !== "boolean") {
      return NextResponse.json({ error: "paymentHold must be true or false." }, { status: 400 });
    }
    data.paymentHold = body.paymentHold;
  }

  if (body.expiresAt !== undefined) {
    data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    // Re-arm both reminders. Extending a gallery otherwise leaves a client who was
    // warned once against the old date and never warned again against the new one.
    data.expiryReminderSentFor = null;
  }

  // Releasing the hold is the moment the client's files go clean, so it is worth a
  // timestamp of its own — "when did they actually get the work" is a question that gets
  // asked months later, and "updated project" in the activity feed does not answer it.
  const turningHoldOff = data.paymentHold === false && project.paymentHold;
  if (turningHoldOff) data.paymentReleasedAt = new Date();

  const updated = await db.project.update({ where: { id }, data });

  const turnedHoldOn = data.paymentHold === true && !project.paymentHold;
  const queued = turnedHoldOn ? await queueProjectForMarking(id) : 0;

  await db.activity.create({
    data: { actor: "You", action: `updated project "${updated.title}"` },
  });
  if (turnedHoldOn) {
    await db.activity.create({
      data: {
        actor: "You",
        action: `put "${updated.title}" on a payment hold — watermarking ${queued} file(s)`,
      },
    });
  }
  // Tell the client their files are clean. Only on the actual on -> off flip, so saving
  // the dialog again on an already-released project does not thank someone twice for the
  // same purchase.
  let released = 0;
  if (turningHoldOff) {
    const receipt = await sendPaymentReleaseReceipt(id);
    released = receipt.sent;
    await db.activity.create({
      data: {
        actor: "You",
        action: `released "${updated.title}" — clean files are now downloadable${
          released > 0 ? `, emailed ${released} owner${released === 1 ? "" : "s"}` : ""
        }`,
      },
    });
  }

  return NextResponse.json({ project: updated, queued, released });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await db.project.findUnique({
    where: { id },
    include: { client: true, _count: { select: { assets: true, submissions: true } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only ever delete a project that holds nothing. Delivered assets need handling
  // deliberately rather than being wiped by a stray click, and footage a client sent is
  // worse still — it is the only copy, and nobody here put it there.
  if (project._count.assets > 0 || project._count.submissions > 0) {
    return NextResponse.json(
      { error: "This project holds files — empty it before deleting the project." },
      { status: 400 }
    );
  }

  await db.project.delete({ where: { id } });
  await rm(inboxDirFor(project.client.username, project.inboxSlug), { recursive: true, force: true });

  await db.activity.create({
    data: { actor: "You", action: `deleted project "${project.title}"` },
  });

  return NextResponse.json({ ok: true });
}
