import { db } from "@/lib/db";
import { canApprove } from "@/lib/reviewAccess";
import type { ScreenCut, ScreenNote } from "@/components/ReviewScreen";

/**
 * Everything the review screen renders, for one viewer.
 *
 * One loader for both entries — the seat page and the guest link — because the only
 * difference between them is how the Reviewer was identified. Two loaders would be two
 * places for the draft-privacy filter to be written, and one of them would eventually be
 * written wrong.
 *
 * That filter is the load-bearing line here: a viewer sees every *sent* note plus their
 * own drafts, and never anybody else's. It is expressed once, as a query, rather than
 * trusted to the component.
 */
export async function loadReviewScreen(projectId: string, reviewerId: string) {
  const reviewer = await db.reviewer.findUnique({ where: { id: reviewerId } });
  if (!reviewer || reviewer.revokedAt || reviewer.projectId !== projectId) return null;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { title: true, client: { select: { name: true } } },
  });
  if (!project) return null;

  // Clients only ever see released cuts. An unsent one exists on disk and in the database
  // but is not theirs to know about until the studio has answered the round before it.
  const rows = await db.review.findMany({
    where: { asset: { projectId }, sentAt: { not: null } },
    orderBy: { version: "asc" },
    include: {
      approvedBy: { select: { name: true } },
      asset: {
        select: { id: true, name: true, contentTitle: true, durationSec: true, dims: true },
      },
    },
  });
  if (rows.length === 0) return null;

  const cuts: ScreenCut[] = rows.map((r) => {
    const [w, h] = (r.asset.dims ?? "").split(/[x×]/).map((n) => parseInt(n.trim(), 10));
    return {
      id: r.id,
      version: r.version,
      sentAt: r.sentAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      approvedByName: r.approvedBy?.name ?? null,
      assetId: r.asset.id,
      durationSec: r.asset.durationSec,
      width: Number.isFinite(w) ? w : null,
      height: Number.isFinite(h) ? h : null,
      fps: null,
    };
  });

  const current = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;

  const toScreenNote = (n: {
    id: string;
    timeSec: number | null;
    body: string;
    sentAt: Date | null;
    reviewerId: string;
    outcome: "CHANGED" | "KEPT" | null;
    response: string | null;
    reviewer: { name: string };
  }): ScreenNote => ({
    id: n.id,
    timeSec: n.timeSec,
    body: n.body,
    sentAt: n.sentAt?.toISOString() ?? null,
    authorId: n.reviewerId,
    authorName: n.reviewer.name,
    outcome: n.outcome,
    response: n.response,
  });

  const notes = await db.reviewNote.findMany({
    where: {
      reviewId: current.id,
      // Sent notes from anyone, drafts from nobody but this viewer.
      OR: [{ sentAt: { not: null } }, { reviewerId }],
    },
    orderBy: [{ timeSec: "asc" }, { createdAt: "asc" }],
    include: { reviewer: { select: { name: true } } },
  });

  const previousNotes = previous
    ? await db.reviewNote.findMany({
        where: { reviewId: previous.id, sentAt: { not: null } },
        orderBy: [{ timeSec: "asc" }, { createdAt: "asc" }],
        include: { reviewer: { select: { name: true } } },
      })
    : [];

  return {
    clientName: project.client.name,
    projectTitle: project.title,
    assetTitle: current.asset.contentTitle || current.asset.name,
    cuts,
    initialCutId: current.id,
    notes: notes.map(toScreenNote),
    previousNotes: previousNotes.map(toScreenNote),
    viewer: {
      id: reviewer.id,
      name: reviewer.name,
      role: reviewer.role,
      canApprove: await canApprove(reviewer),
    },
  };
}
