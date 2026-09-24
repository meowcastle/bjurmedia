import { rm } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveSubmissionPath } from "@/lib/media";

/**
 * Remove a batch's bytes from the server, keeping the record of what arrived.
 *
 * Rushes are large and temporary; the fact that they came is small and permanent. Before
 * this there was no way to reclaim the space without deleting the row too, which is why
 * 302 GB of finished-with footage sat on the NAS — the only lever was one that also
 * erased the evidence it had ever been sent.
 *
 * The row survives with filesDeletedAt set, so the client page can still say what was
 * sent, by whom and when, long after the files are gone.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const batch = await db.uploadBatch.findUnique({
    where: { id },
    include: { client: { select: { username: true, name: true } }, submissions: true },
  });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (batch.filesDeletedAt) {
    return NextResponse.json({ error: "Already deleted." }, { status: 409 });
  }

  // Refuse while anything is still arriving. Deleting the folder out from under a live
  // upload leaves the sender's browser happily pushing chunks into nothing.
  const inFlight = batch.submissions.filter((s) => s.status === "UPLOADING").length;
  if (inFlight > 0) {
    return NextResponse.json(
      { error: `${inFlight} file${inFlight === 1 ? " is" : "s are"} still arriving.` },
      { status: 409 }
    );
  }

  // Resolved through the same guard every other submission path goes through, so a
  // batch name cannot walk out of SUBMISSIONS_ROOT.
  const dir = await resolveSubmissionPath(path.join(batch.client.username, batch.name)).catch(
    () => null
  );
  if (!dir) return NextResponse.json({ error: "Could not resolve that folder." }, { status: 400 });

  await rm(dir, { recursive: true, force: true });
  await db.uploadBatch.update({ where: { id }, data: { filesDeletedAt: new Date() } });

  const bytes = batch.submissions.reduce((n, s) => n + Number(s.receivedBytes), 0);
  await db.activity.create({
    data: {
      actor: "You",
      action: `deleted the files from "${batch.name}" (${batch.client.name}) — ${Math.round(
        bytes / 1024 / 1024 / 1024
      )} GB freed, the record kept`,
    },
  });

  return NextResponse.json({ ok: true, freedBytes: String(bytes) });
}
