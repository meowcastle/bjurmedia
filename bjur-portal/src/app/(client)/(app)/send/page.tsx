import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SubmissionUploadClient } from "@/components/SubmissionUploadClient";
import { ClientSentList } from "@/components/ClientSentList";

/**
 * Send to Bjur — a client seat's own door, with no link and no project.
 *
 * Below the drop zone is a record of what this client has sent, and only a record. After
 * ingest nothing here can be opened, played or downloaded: the files are working material
 * on our server, not a library the client browses. That is enforced by there being no
 * route that serves them to a client session, not by this page declining to link.
 */
export default async function ClientSendPage() {
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const batches = await db.uploadBatch.findMany({
    where: { clientId: session.clientId },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      user: { select: { name: true } },
      submissions: { select: { status: true, receivedBytes: true, filename: true } },
    },
  });

  return (
    <>
      <SubmissionUploadClient heading="Send us footage" expired={false} />
      <ClientSentList
        batches={batches.map((b) => ({
          id: b.id,
          name: b.name,
          who: b.user?.name ?? b.senderName ?? "Someone",
          fileCount: b.submissions.length,
          complete: b.submissions.every((s) => s.status === "COMPLETE"),
          receivedBytes: String(b.submissions.reduce((n, s) => n + Number(s.receivedBytes), 0)),
          kinds: [
            ...new Set(
              b.submissions.map((s) => s.filename.split(".").pop()?.toUpperCase() ?? "").filter(Boolean)
            ),
          ].slice(0, 4),
          createdAt: b.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
