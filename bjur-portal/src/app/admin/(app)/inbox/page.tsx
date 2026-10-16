import { db } from "@/lib/db";
import { AdminInboxClient } from "@/components/AdminInboxClient";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage() {
  const [pending, recent] = await Promise.all([
    db.agentDraft.findMany({
      where: { state: "PENDING" },
      include: { deal: { select: { title: true } }, contact: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.agentDraft.findMany({
      where: { state: { not: "PENDING" } },
      include: { deal: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const why = (context: unknown) =>
    context && typeof context === "object" && "trigger" in context && typeof context.trigger === "string"
      ? context.trigger
      : null;

  return (
    <AdminInboxClient
      pending={pending.map((d) => ({
        id: d.id,
        kind: d.kind,
        toEmail: d.toEmail ?? "",
        toName: d.contact?.name ?? null,
        subject: d.subject ?? "",
        body: d.body,
        why: why(d.context),
        dealTitle: d.deal?.title ?? null,
        createdAt: d.createdAt.toISOString(),
      }))}
      recent={recent.map((d) => ({
        id: d.id,
        kind: d.kind,
        state: d.state,
        toEmail: d.toEmail,
        subject: d.subject,
        dealTitle: d.deal?.title ?? null,
        at: (d.sentAt ?? d.dismissedAt ?? d.approvedAt ?? d.createdAt).toISOString(),
        error: d.error,
      }))}
    />
  );
}
