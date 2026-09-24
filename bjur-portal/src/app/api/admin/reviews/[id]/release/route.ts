import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { releaseCut } from "@/lib/reviews";
import { notifyCutReady } from "@/lib/reviewMail";

/**
 * Send an unsent cut to its reviewers.
 *
 * releaseCut holds the gate: it refuses while any sent note on the previous cut lacks an
 * outcome. That is checked there rather than here so the rule survives whoever calls it.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return new Response(null, { status: 403 });

  const { id } = await params;
  const result = await releaseCut(id);
  if (!result.ok) {
    if (result.error === "unanswered") {
      return NextResponse.json(
        { error: `Answer ${result.unanswered} more note${result.unanswered === 1 ? "" : "s"} first.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "That cut cannot be sent." }, { status: 409 });
  }

  const mail = await notifyCutReady(id);

  const cut = await db.review.findUnique({
    where: { id },
    include: { asset: { select: { name: true, contentTitle: true } } },
  });
  await db.activity.create({
    data: {
      actor: "You",
      action: `Mail: ${cut?.asset.contentTitle || cut?.asset.name} cut ${cut?.version} sent to ${
        mail.sent
      } reviewer${mail.sent === 1 ? "" : "s"} · ${mail.notes ?? 0} notes answered`,
    },
  });

  return NextResponse.json({ sent: mail.sent });
}
