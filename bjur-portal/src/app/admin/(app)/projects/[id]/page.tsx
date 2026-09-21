import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { inboxDirFor } from "@/lib/projects";
import { slugify, stateOf, SUBMISSION_REQUEST_TTL_DAYS } from "@/lib/submissionRequests";
import { AdminProjectDetailClient } from "@/components/AdminProjectDetailClient";

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, accentColor: true } },
      submissionRequests: { orderBy: { createdAt: "desc" } },
      _count: { select: { assets: true, submissions: true } },
    },
  });
  if (!project) notFound();

  const [visibleAssets, receivedBytes] = await Promise.all([
    db.asset.count({ where: { projectId: id, internal: false } }),
    db.submission.aggregate({ where: { projectId: id }, _sum: { sizeBytes: true } }),
  ]);

  const channel = await db.clientChannel.findUnique({ where: { clientId: project.clientId } });

  return (
    <AdminProjectDetailClient
      project={{
        id: project.id,
        title: project.title,
        type: project.type,
        review: project.review,
        paymentHold: project.paymentHold,
        deliveredAt: project.deliveredAt?.toISOString() ?? null,
        expiresAt: project.expiresAt?.toISOString() ?? null,
        inboxPath: inboxDirFor(project.client.name, project.inboxSlug),
        slug: slugify(project.title),
        fileCount: visibleAssets,
        submissionCount: project._count.submissions,
        // BigInt cannot cross the RSC boundary.
        receivedBytes: String(receivedBytes._sum.sizeBytes ?? 0),
        // Deleting a project that holds anything would take files with it, so the footer
        // says what is in the way rather than offering a button that refuses.
        isEmpty: project._count.assets === 0 && project._count.submissions === 0,
        hasSlackChannel: channel !== null,
      }}
      client={{ id: project.client.id, name: project.client.name }}
      requests={project.submissionRequests.map((r) => ({
        id: r.id,
        name: r.name,
        state: stateOf(r),
        sendPath: `/send/${slugify(project.title)}/${slugify(r.name)}-${r.token}`,
        folder: `submissions/${slugify(r.name)}/`,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      }))}
      ttlDays={SUBMISSION_REQUEST_TTL_DAYS}
    />
  );
}
