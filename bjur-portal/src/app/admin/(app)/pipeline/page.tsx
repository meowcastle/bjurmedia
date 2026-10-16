import { db } from "@/lib/db";
import { AdminPipelineClient } from "@/components/AdminPipelineClient";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** A month back from the moment of the request. */
function monthAgo() {
  return new Date(Date.now() - 30 * DAY);
}

export default async function AdminPipelinePage() {
  // Everything open, plus what closed in the last month: a board of every lost lead ever
  // is a graveyard, not a pipeline.
  const since = monthAgo();
  const [deals, tasks, clients] = await Promise.all([
    db.deal.findMany({
      where: { OR: [{ closedAt: null }, { closedAt: { gte: since } }] },
      include: {
        contact: { select: { name: true, email: true } },
        client: { select: { name: true } },
        project: { select: { id: true, paymentHold: true } },
      },
      orderBy: { stageChangedAt: "asc" },
    }),
    db.task.findMany({
      where: { doneAt: null },
      include: { deal: { select: { title: true } } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    }),
    db.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <AdminPipelineClient
      deals={deals.map((d) => ({
        id: d.id,
        title: d.title,
        stage: d.stage,
        stageChangedAt: d.stageChangedAt.toISOString(),
        amount: d.amount,
        who: d.contact?.name ?? d.client?.name ?? null,
        clientName: d.client?.name ?? null,
        projectId: d.project?.id ?? null,
        unpaid: d.stage === "DELIVERED" && !!d.project?.paymentHold,
      }))}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueAt: t.dueAt?.toISOString() ?? null,
        dealTitle: t.deal?.title ?? null,
        agent: t.source === "AGENT",
      }))}
      clients={clients}
    />
  );
}
