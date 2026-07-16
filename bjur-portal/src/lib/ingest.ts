import { execFileSync } from "child_process";
import { mkdir, rename, copyFile, unlink } from "fs/promises";
import { statSync, existsSync } from "fs";
import path from "path";
import { imageSizeFromFile } from "image-size/fromFile";
import { db } from "@/lib/db";
import { MEDIA_ROOT, INBOX_ROOT } from "@/lib/media";
import { postSlackEvent } from "@/lib/slack";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"]);
const RAW_VIDEO_EXT = new Set([".braw", ".r3d", ".ari"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ...RAW_VIDEO_EXT]);

function humanSize(bytes: number) {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function probeVideo(absPath: string) {
  const out = execFileSync(
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
      absPath,
    ],
    { encoding: "utf-8" }
  );
  const data = JSON.parse(out);
  const videoStream = (data.streams ?? []).find((s: { codec_type: string }) => s.codec_type === "video");
  return {
    width: videoStream?.width ?? 0,
    height: videoStream?.height ?? 0,
    codecName: videoStream?.codec_name ?? "unknown",
    durationSec: data.format?.duration ? Math.round(parseFloat(data.format.duration)) : null,
  };
}

export type Classification = {
  kind: "PHOTO" | "VIDEO";
  format: "Reel" | "Film" | "Still" | "Master";
  orientation: "landscape" | "portrait";
  dims: string | null;
  durationSec: number | null;
  masterCodec: string;
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
      };
    }
    const { width, height, codecName, durationSec } = probeVideo(absPath);
    const orientation = height > width ? "portrait" : "landscape";
    return {
      kind: "VIDEO",
      format: orientation === "portrait" ? "Reel" : "Film",
      orientation,
      dims: width && height ? `${width}×${height}` : null,
      durationSec,
      masterCodec: `${codecName.toUpperCase()} · ${humanSize(sizeBytes)}`,
    };
  }

  throw new Error(`Unrecognized export type: ${ext}`);
}

/** Resolve INBOX_ROOT/<clientUsername>/<inboxSlug>/... back to its Project row. */
export async function resolveProjectFromInboxPath(absPath: string) {
  const rel = path.relative(INBOX_ROOT, absPath);
  const [clientUsername, inboxSlug] = rel.split(path.sep);
  if (!clientUsername || !inboxSlug) return null;

  const project = await db.project.findUnique({
    where: { inboxSlug },
    include: { client: true },
  });
  if (!project || project.client.username !== clientUsername) return null;
  return project;
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

  await moveFile(absPath, destAbsPath);

  const isMaster = classification.format === "Master";
  const licensable = isMaster && project.client.type === "ONEOFF";
  const internal = isMaster && project.client.type === "RETAINER";

  const asset = await db.asset.create({
    data: {
      projectId: project.id,
      kind: classification.kind,
      format: classification.format,
      orientation: classification.orientation,
      name: filename,
      relPath,
      sizeBytes: BigInt(sizeBytes),
      dims: classification.dims,
      durationSec: classification.durationSec,
      masterCodec: classification.masterCodec,
      proxyStatus: "PENDING",
      internal,
      licensable,
    },
  });

  if (project.status === "DRAFT") {
    await db.project.update({
      where: { id: project.id },
      data: { status: "LIVE", deliveredAt: new Date() },
    });
  }

  await db.activity.create({
    data: {
      actor: project.client.name,
      action: `auto-ingested "${filename}" into ${project.title}`,
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
          text: `:package: *New delivery — ${project.client.name}*\n*${project.title}*\n${filename} auto-ingested · proxy generating`,
        },
      },
    ],
  });

  return asset;
}
