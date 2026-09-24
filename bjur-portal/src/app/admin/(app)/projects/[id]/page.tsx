import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { inboxDirFor } from "@/lib/projects";
import { slugify } from "@/lib/submissionRequests";
import { formatBytes } from "@/lib/format";
import { AdminProjectDetailClient } from "@/components/AdminProjectDetailClient";

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, accentColor: true } },
      _count: { select: { assets: true } },
    },
  });
  if (!project) notFound();

  const assets = await db.asset.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });

  // Film only. A delivery has neither, and querying for them on every project page would
  // be two round trips to learn nothing.
  const filmCuts =
    project.type === "FILM"
      ? await db.review.findMany({
          where: { asset: { projectId: id } },
          orderBy: { version: "asc" },
          include: {
            approvedBy: { select: { name: true } },
            notes: {
              where: { sentAt: { not: null } },
              select: { outcome: true, reviewerId: true, reviewer: { select: { name: true } } },
            },
          },
        })
      : [];
  const filmReviewers =
    project.type === "FILM"
      ? await db.reviewer.findMany({
          where: { projectId: id },
          orderBy: { createdAt: "asc" },
          include: {
            notes: {
              // Drafts are counted, never read. The admin surface says "drafting", and the
              // body of that draft never leaves the author's own screen.
              select: { sentAt: true, reviewId: true },
            },
          },
        })
      : [];
  const latestCutId = filmCuts.filter((c) => c.sentAt).slice(-1)[0]?.id ?? null;

  const channel = await db.clientChannel.findUnique({ where: { clientId: project.clientId } });

  return (
    <AdminProjectDetailClient
      film={
        project.type === "FILM"
          ? {
              cuts: filmCuts.map((c) => ({
                id: c.id,
                version: c.version,
                sentAt: c.sentAt?.toISOString() ?? null,
                approvedAt: c.approvedAt?.toISOString() ?? null,
                approvedByName: c.approvedBy?.name ?? null,
                noteCount: c.notes.length,
                unanswered: c.notes.filter((n) => !n.outcome).length,
                authors: [...new Set(c.notes.map((n) => n.reviewer.name))].filter(Boolean),
              })),
              reviewers: filmReviewers.map((r) => ({
                id: r.id,
                name: r.name,
                email: r.email,
                kind: r.kind,
                role: r.role,
                sentOnLatest: r.notes.filter((n) => n.sentAt && n.reviewId === latestCutId).length,
                draftingOnLatest: r.notes.some((n) => !n.sentAt && n.reviewId === latestCutId),
                lastOpenedAt: r.lastOpenedAt?.toISOString() ?? null,
                revoked: r.revokedAt !== null,
              })),
            }
          : null
      }
      project={{
        id: project.id,
        title: project.title,
        type: project.type,
        paymentHold: project.paymentHold,
        deliveredAt: project.deliveredAt?.toISOString() ?? null,
        expiresAt: project.expiresAt?.toISOString() ?? null,
        inboxPath: inboxDirFor(project.client.name, project.inboxSlug),
        slug: slugify(project.title),
        fileCount: assets.filter((a) => !a.internal).length,
        // Deleting a project that holds delivered work would take it with it, so the
        // footer says what is in the way rather than offering a button that refuses.
        // Footage is no longer part of that question — it belongs to the client.
        isEmpty: project._count.assets === 0,
        hasSlackChannel: channel !== null,
      }}
      client={{ id: project.client.id, name: project.client.name }}
      assets={assets.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        format: a.format,
        // Serialised: sizeBytes is a BigInt, which does not survive the RSC boundary.
        size: formatBytes(Number(a.sizeBytes)),
        dims: a.dims,
        durationSec: a.durationSec,
        masterCodec: a.masterCodec,
        proxyRes: a.proxyRes,
        relPath: a.relPath,
        proxyStatus: a.proxyStatus,
        proxyProgress: a.proxyProgress,
        internal: a.internal,
        weekOf: a.weekOf?.toISOString() ?? null,
        thumbReady: a.thumbRelPath != null,
        markStatus: a.markStatus,
      }))}
    />
  );
}
