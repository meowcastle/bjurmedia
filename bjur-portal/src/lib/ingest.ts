import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, rename, copyFile, unlink } from "fs/promises";
import { statSync, existsSync } from "fs";
import path from "path";
import { imageSizeFromFile } from "image-size/fromFile";
import { db } from "@/lib/db";
import { MEDIA_ROOT, INBOX_ROOT } from "@/lib/media";
import { postSlackEvent } from "@/lib/slack";
import { markDeliveryPending } from "@/lib/deliveryNotify";
import { AUDIO_EXT as AUDIO_EXT_LIST, RAW_CAMERA_EXT, isFileOnly } from "@/lib/fileOnly";

const execFileAsync = promisify(execFile);

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"]);
const RAW_VIDEO_EXT = new Set<string>(RAW_CAMERA_EXT);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ...RAW_VIDEO_EXT]);
const AUDIO_EXT = new Set<string>(AUDIO_EXT_LIST);

const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses studio date-folder names like "MARCH 9 2026" or "APRIL 13TH 2026" (any
 * casing, ordinal suffix optional) into a Date. Returns null for anything that
 * isn't shaped like one of these folder names — e.g. a plain filename or "WIPS".
 */
/** Today's calendar date in New York, as UTC midnight — the same shape parseDateFolder returns. */
function todayInNewYork(): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function parseDateFolder(name: string): Date | null {
  const match = name.trim().match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (!match) return null;
  const month = MONTH_ABBR[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const day = parseInt(match[2], 10);
  if (day < 1 || day > 31) return null;
  return new Date(Date.UTC(parseInt(match[3], 10), month, day));
}

function humanSize(bytes: number) {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

async function probeVideo(absPath: string) {
  // ffprobe only reads headers/metadata, so it should always finish in well under a
  // second regardless of file size — the timeout here is a safety net, not a normal-
  // operation constraint. Using the async form (not execFileSync) matters: a corrupted
  // file can put the ffprobe process into an uninterruptible kernel I/O wait that no
  // signal can break, sometimes for many minutes — and a *synchronous* call blocks the
  // worker's single thread for that entire span, freezing ingest, proxy generation,
  // everything, until it finally resolves on its own. The async form only ties up this
  // one queued item; the rest of the process keeps running. killSignal: SIGKILL gives
  // the best real chance of the process actually dying the moment it becomes killable.
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "stream=width,height,codec_name,codec_type",
      "-show_entries",
      "format=duration",
      "-show_entries",
      "format_tags=creation_time",
      absPath,
    ],
    { encoding: "utf-8", timeout: 30_000, killSignal: "SIGKILL" }
  );
  const data = JSON.parse(stdout);
  const videoStream = (data.streams ?? []).find((s: { codec_type: string }) => s.codec_type === "video");
  const rawCreationTime = data.format?.tags?.creation_time;
  const capturedAt = rawCreationTime && !isNaN(Date.parse(rawCreationTime)) ? rawCreationTime : null;
  return {
    width: videoStream?.width ?? 0,
    height: videoStream?.height ?? 0,
    codecName: videoStream?.codec_name ?? "unknown",
    durationSec: data.format?.duration ? Math.round(parseFloat(data.format.duration)) : null,
    capturedAt,
  };
}

/**
 * Audio only needs its length. Same async, SIGKILL-on-timeout shape as probeVideo and
 * for the same reason; a failed probe is not a failed ingest — a .wav with a header
 * ffprobe dislikes is still a file the client is owed, it just lists without a duration.
 */
async function probeAudioDuration(absPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", absPath],
      { encoding: "utf-8", timeout: 30_000, killSignal: "SIGKILL" }
    );
    const sec = parseFloat(stdout.trim());
    return Number.isFinite(sec) ? Math.round(sec) : null;
  } catch {
    return null;
  }
}

export type Classification = {
  kind: "PHOTO" | "VIDEO" | "AUDIO";
  format: "Reel" | "Film" | "Still" | "Master" | "Audio";
  orientation: "landscape" | "portrait";
  dims: string | null;
  durationSec: number | null;
  masterCodec: string;
  capturedAt: string | null;
};

export async function classifyMedia(absPath: string): Promise<Classification> {
  const ext = path.extname(absPath).toLowerCase();
  const sizeBytes = statSync(absPath).size;

  if (IMAGE_EXT.has(ext)) {
    const { width, height } = await imageSizeFromFile(absPath);
    return {
      kind: "PHOTO",
      format: "Still",
      orientation: height > width ? "portrait" : "landscape",
      dims: `${width}×${height}`,
      durationSec: null,
      masterCodec: `${ext.slice(1).toUpperCase()} · ${humanSize(sizeBytes)}`,
      capturedAt: null,
    };
  }

  if (VIDEO_EXT.has(ext)) {
    if (RAW_VIDEO_EXT.has(ext)) {
      // Raw camera masters aren't probed for orientation here — treated as landscape
      // deliverable masters per the existing licensing convention (see ARCHITECTURE.md).
      return {
        kind: "VIDEO",
        format: "Master",
        orientation: "landscape",
        dims: null,
        durationSec: null,
        masterCodec: `${ext.slice(1).toUpperCase()} · ${humanSize(sizeBytes)}`,
        capturedAt: null,
      };
    }
    const { width, height, codecName, durationSec, capturedAt } = await probeVideo(absPath);
    const orientation = height > width ? "portrait" : "landscape";
    return {
      kind: "VIDEO",
      format: orientation === "portrait" ? "Reel" : "Film",
      orientation,
      dims: width && height ? `${width}×${height}` : null,
      durationSec,
      masterCodec: `${codecName.toUpperCase()} · ${humanSize(sizeBytes)}`,
      capturedAt,
    };
  }

  if (AUDIO_EXT.has(ext)) {
    // Production sound for a RAW delivery. No picture, so no orientation to speak of —
    // "landscape" only because the column is required and it is the neutral value.
    return {
      kind: "AUDIO",
      format: "Audio",
      orientation: "landscape",
      dims: null,
      durationSec: await probeAudioDuration(absPath),
      masterCodec: `${ext.slice(1).toUpperCase()} · ${humanSize(sizeBytes)}`,
      capturedAt: null,
    };
  }

  throw new Error(`Unrecognized export type: ${ext}`);
}

/**
 * Resolve INBOX_ROOT/<clientUsername>/<anything>/... back to its Project row.
 *
 * Prefers an exact match on the second path segment against the project's
 * generated inboxSlug. If that doesn't match — e.g. someone dropped in their own
 * folder name instead of the generated slug — falls back to the client's only
 * project, if they have exactly one. With two or more projects there's no safe
 * way to guess which one a file belongs to (that's exactly the kind of mixup this
 * app exists to prevent), so it's left unmatched rather than routed on a guess.
 */
export async function resolveProjectFromInboxPath(absPath: string) {
  const rel = path.relative(INBOX_ROOT, absPath);
  const [clientUsername, inboxSlug] = rel.split(path.sep);
  if (!clientUsername || !inboxSlug) return null;

  const exact = await db.project.findUnique({
    where: { inboxSlug },
    include: { client: true },
  });
  if (exact && exact.client.username === clientUsername) return exact;

  const client = await db.client.findUnique({ where: { username: clientUsername } });
  if (!client) return null;

  const clientProjects = await db.project.findMany({
    where: { clientId: client.id },
    include: { client: true },
  });
  return clientProjects.length === 1 ? clientProjects[0] : null;
}

async function moveFile(src: string, dest: string) {
  await mkdir(path.dirname(dest), { recursive: true });
  try {
    await rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await copyFile(src, dest);
      await unlink(src);
    } else {
      throw err;
    }
  }
}

/**
 * Full ingest pipeline for one file dropped into a project's inbox folder:
 * classify -> move into MEDIA_ROOT's canonical CLIENT/PROJECT/FORMAT path -> register
 * as an Asset (auto-visible, per studio's "these are finals" workflow) -> notify.
 */
export async function ingestFile(absPath: string) {
  // Guards against duplicate fs "add" events for the same file (fsevents can fire more
  // than one for a single logical write) racing past the in-process de-dupe in worker.ts.
  if (!existsSync(absPath)) return;

  // Work-in-progress exports live in a "WIPS"/"WIP" subfolder alongside the finals and
  // should never reach a client gallery. Drop them from the inbox rather than delivering
  // drafts — the studio's real originals live elsewhere, this is only a staging copy.
  const inboxSegmentsForWipCheck = path.relative(INBOX_ROOT, absPath).split(path.sep);
  if (inboxSegmentsForWipCheck.some((seg) => /^wips?$/i.test(seg))) {
    await unlink(absPath);
    await db.activity.create({
      data: {
        actor: "Worker",
        action: `Discarded WIP file (not delivered): ${inboxSegmentsForWipCheck.join("/")}`,
      },
    });
    return;
  }

  const project = await resolveProjectFromInboxPath(absPath);
  if (!project) {
    await db.activity.create({
      data: {
        actor: "Worker",
        action: `Could not match inbox file to a project: ${path.relative(INBOX_ROOT, absPath)}`,
      },
    });
    return;
  }

  const classification = await classifyMedia(absPath);
  const filename = path.basename(absPath);
  const relPath = `${project.path}/${classification.format}/${filename}`;
  const destAbsPath = path.join(MEDIA_ROOT, relPath);
  const sizeBytes = statSync(absPath).size;

  // The date-named subfolder editors drop weekly batches into (e.g. "MARCH 9 2026")
  // sits right after the client/project segments and is otherwise discarded once the
  // file is moved — capture it here so the client gallery's week view has something
  // to group on.
  const inboxSegments = path.relative(INBOX_ROOT, absPath).split(path.sep);
  const datedFolder = inboxSegments[2] ? parseDateFolder(inboxSegments[2]) : null;

  await moveFile(absPath, destAbsPath);

  // Masters are working files. With licensing gone there is nothing a client can do
  // with one, so they stay in-house rather than appearing in a gallery as something to
  // scroll past and wonder about.
  //
  // The exception is a RAW project, whose whole point is handing the camera originals and
  // the production sound over: there they are the delivery, listed as files and locked
  // while the payment hold is on (paymentHold.ts, lockedUnderHold). Audio is only ever
  // expected on a RAW project; anywhere else it is kept in-house like a Master, because a
  // Delivery gallery has no slot for it and a client should not find a stray scratch
  // track among their finals.
  const deliveredAsFile = classification.format === "Master" || classification.kind === "AUDIO";
  const internal = deliveredAsFile && project.type !== "RAW";

  // Nothing to encode for a file-only asset (fileOnly.ts): ffmpeg cannot open a raw
  // original, and audio has no picture. Marking it READY up front keeps it out of the
  // proxy queue entirely, instead of queueing it only for a guaranteed failure and an
  // Activity line per clip — 33 of them on one card dump. READY with no proxyRelPath or
  // thumbRelPath is what "nothing to make" looks like; every serving route already
  // answers 404 for a missing rendition rather than erroring.
  const proxyStatus = isFileOnly({ kind: classification.kind, name: filename }) ? "READY" : "PENDING";

  // Same project + same destination path (i.e. same filename dropped again, an
  // updated re-export) should replace the existing asset in place, not duplicate it —
  // otherwise the DB ends up with two rows pointing at the same relPath, one of them
  // silently stale the moment the file underneath it got overwritten. Updating in
  // place also means favorites/licenses on the original asset survive a re-upload.
  // internal/licensable are deliberately left untouched here — those can be an
  // admin's manual override and a re-upload shouldn't stomp them.
  const existing = await db.asset.findFirst({ where: { projectId: project.id, relPath } });

  // Without a date folder, a file belongs to the week it arrived — a render dropped
  // straight into the project's inbox is this week's post. A re-export keeps the week
  // it already had, so fixing an old reel doesn't pull it into this week.
  const weekOf = datedFolder ?? existing?.weekOf ?? todayInNewYork();
  const asset = existing
    ? await db.asset.update({
        where: { id: existing.id },
        data: {
          kind: classification.kind,
          orientation: classification.orientation,
          weekOf,
          sizeBytes: BigInt(sizeBytes),
          dims: classification.dims,
          durationSec: classification.durationSec,
          masterCodec: classification.masterCodec,
          proxyStatus,
          proxyRelPath: null,
          thumbRelPath: null,
          proxyRes: null,
          reingestCount: { increment: 1 },
          lastReplacedAt: new Date(),
        },
      })
    : await db.asset.create({
        data: {
          projectId: project.id,
          kind: classification.kind,
          format: classification.format,
          orientation: classification.orientation,
          name: filename,
          relPath,
          weekOf,
          sizeBytes: BigInt(sizeBytes),
          dims: classification.dims,
          durationSec: classification.durationSec,
          masterCodec: classification.masterCodec,
          proxyStatus,
          internal,
        },
      });

  if (project.status === "DRAFT") {
    await db.project.update({
      where: { id: project.id },
      data: { status: "LIVE", deliveredAt: new Date() },
    });
  }

  // A Film project's cuts wait until the studio releases them (reviews.ts), and the
  // cut-ready mail sent on release is their announcement. A delivery mail here would tell
  // the client about a draft fifteen minutes after it landed in the inbox.
  // RAW projects do get the mail: their files are final the moment they land, and the
  // batch summary counts raw clips and audio files (deliveryNotify.ts).
  if (project.type !== "FILM") await markDeliveryPending(project.id);

  const verb = existing ? "replaced" : "auto-ingested";

  await db.activity.create({
    data: {
      actor: project.client.name,
      action: `${verb} "${filename}" in ${project.title}`,
    },
  });

  await postSlackEvent({
    clientId: project.clientId,
    toggle: "autoUpload",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:package: *${existing ? "Updated files" : "New files"} — ${project.client.name}*\n*${project.title}*\n${filename} ${verb} · ${proxyStatus === "READY" ? "file only, no preview" : "proxy generating"}`,
        },
      },
    ],
  });

  return { asset, capturedAt: classification.capturedAt };
}
