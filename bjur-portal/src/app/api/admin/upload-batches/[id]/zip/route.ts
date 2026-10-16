import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveSubmissionPath } from "@/lib/media";

/** Fallback for when Justin isn't on the LAN — the bin itself, over SMB, is the primary path. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return new Response(null, { status: 401 });

  const batch = await db.uploadBatch.findUnique({
    where: { id: batchId },
    include: { submissions: { where: { status: "COMPLETE" } } },
  });
  if (!batch) return new Response(null, { status: 404 });

  const entries: { path: string; name: string }[] = [];
  for (const s of batch.submissions) {
    const resolved = await resolveSubmissionPath(s.relPath).catch(() => null);
    if (resolved) entries.push({ path: resolved, name: s.relativePath });
  }

  // Stored, not deflated. Video and photos are already compressed, so deflate saved
  // nothing and ran at ~3 MB/s — a multi-gigabyte zip trickled out for an hour and
  // phones gave up partway. Stored streams at disk speed and is the same size.
  const archive = new ZipArchive({ store: true });
  archive.on("warning", (err: Error) => console.warn("[upload-batch-zip]", err));
  archive.on("error", (err: Error) => console.error("[upload-batch-zip]", err));
  for (const entry of entries) archive.file(entry.path, { name: entry.name });
  archive.finalize();

  return new Response(Readable.toWeb(archive as unknown as Readable) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${batch.name}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
