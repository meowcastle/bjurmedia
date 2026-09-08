import { db } from "@/lib/db";
import { resolveDerivedPath, resolveMediaPath } from "@/lib/media";
import {
  extractAudio,
  discardAudio,
  deepgramTranscriber,
  transcriptionConfigured,
  type Transcriber,
} from "@/lib/transcribe";
import { claudeDrafter, draftingConfigured, type CaptionDrafter } from "@/lib/captionDraft";

/**
 * Which deliverables get captioned. Reels only, per the brief — the weekly social
 * uploads. Widening this to Film is a matter of adding it here; Master is deliberately
 * absent, since masters are internal working files, not posts.
 */
export const CAPTIONABLE_FORMATS = ["Reel"];

/** Nothing backfills. Only assets queued at ingest are ever considered. */
export async function queueForCaptioning(assetId: string) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      kind: true,
      format: true,
      internal: true,
      project: { select: { client: { select: { autoCaption: true } } } },
    },
  });
  if (!asset) return false;
  if (asset.kind !== "VIDEO" || asset.internal) return false;
  if (!CAPTIONABLE_FORMATS.includes(asset.format)) return false;
  if (!asset.project.client.autoCaption) return false;

  await db.asset.update({ where: { id: assetId }, data: { transcriptStatus: "PENDING" } });
  return true;
}

export type CaptionDeps = {
  transcribe: Transcriber;
  draft: CaptionDrafter;
  /** Whether transcription can run at all. */
  configured: () => boolean;
  /** Whether the drafting half is available — separate, since either key may be absent. */
  drafting: () => boolean;
};

/**
 * Transcribes and drafts everything queued.
 *
 * Claims a row by moving PENDING → RUNNING conditionally, the same guard the publisher
 * uses: a second runner finds nothing to take, and a row left RUNNING by a crash is not
 * silently retried — it is left for a person, because the provider was probably already
 * paid for that minute.
 */
export async function processCaptionQueue(deps: Partial<CaptionDeps> = {}) {
  const transcribe = deps.transcribe ?? deepgramTranscriber;
  const draft = deps.draft ?? claudeDrafter;
  const configured = deps.configured ?? transcriptionConfigured;
  const canDraft = deps.drafting ?? draftingConfigured;

  if (!configured()) return { done: 0, noSpeech: 0, failed: 0 };

  const queued = await db.asset.findMany({
    where: { transcriptStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: {
      id: true,
      name: true,
      relPath: true,
      proxyRelPath: true,
      durationSec: true,
      caption: true,
      captionYT: true,
      contentTitle: true,
      captionSource: true,
      project: { select: { title: true, client: { select: { name: true } } } },
    },
  });

  let done = 0;
  let noSpeech = 0;
  let failed = 0;

  for (const asset of queued) {
    const claim = await db.asset.updateMany({
      where: { id: asset.id, transcriptStatus: "PENDING" },
      data: { transcriptStatus: "RUNNING" },
    });
    if (claim.count === 0) continue;

    let audioPath: string | null = null;
    try {
      // The proxy where there is one: it is already H.264 at a sane size, so pulling
      // audio out of it is far cheaper than reading a multi-gigabyte master.
      const source = asset.proxyRelPath
        ? await resolveDerivedPath(asset.proxyRelPath)
        : await resolveMediaPath(asset.relPath);

      audioPath = await extractAudio(source);
      const { text } = await transcribe(audioPath);

      if (!text || text.length < 12) {
        // A music video or a silent cutaway. Not a failure, and not something to
        // invent copy for.
        await db.asset.update({
          where: { id: asset.id },
          data: { transcriptStatus: "NO_SPEECH", transcript: text || null, transcribedAt: new Date() },
        });
        noSpeech++;
        continue;
      }

      const drafted = canDraft()
        ? await draft({
            transcript: text,
            clientName: asset.project.client.name,
            projectTitle: asset.project.title,
            assetName: asset.name,
            durationSec: asset.durationSec,
          })
        : null;

      // Never overwrite copy a person wrote. The transcript is always stored; the
      // draft only fills fields that are still empty.
      const humanWrote = asset.captionSource === "HUMAN";
      const captionTaken = humanWrote && !!asset.caption;
      const ytTaken = humanWrote && !!asset.captionYT;
      const titleTaken = humanWrote && !!asset.contentTitle;

      await db.asset.update({
        where: { id: asset.id },
        data: {
          transcript: text,
          transcriptStatus: "DONE",
          transcribedAt: new Date(),
          transcriptError: null,
          ...(drafted
            ? {
                ...(captionTaken ? {} : { caption: drafted.instagram }),
                ...(ytTaken ? {} : { captionYT: drafted.youtube }),
                ...(titleTaken ? {} : { contentTitle: drafted.youtubeTitle }),
                // Only claim AI authorship if something was actually written.
                ...(captionTaken && ytTaken && titleTaken ? {} : { captionSource: "AI" as const }),
              }
            : {}),
        },
      });
      done++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.asset.update({
        where: { id: asset.id },
        data: { transcriptStatus: "FAILED", transcriptError: message.slice(0, 500) },
      });
      failed++;
    } finally {
      if (audioPath) await discardAudio(audioPath);
    }
  }

  return { done, noSpeech, failed };
}
