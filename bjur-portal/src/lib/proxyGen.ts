import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { resolveMediaPath, DERIVED_ROOT } from "@/lib/media";

const execFileAsync = promisify(execFile);

const WATERMARK_FONT =
  process.env.WATERMARK_FONT ?? "/System/Library/Fonts/Supplemental/Arial Bold.ttf";

type AssetRow = Awaited<ReturnType<typeof db.asset.findFirstOrThrow>>;

// Real transcodes of this studio's short-form content legitimately take a few
// minutes on the NAS's CPU, but with no timeout at all a single corrupted/unusual
// input can hang ffmpeg forever. Using the async form (not execFileSync) matters on
// top of that: a corrupted file can put ffmpeg into an uninterruptible kernel I/O
// wait that no signal can break, sometimes for many minutes — a *synchronous* call
// blocks the worker's single thread for that whole span, freezing ingest, every other
// proxy job, everything, until it finally resolves on its own. The async form only
// ties up this one asset's job. An hour is generous enough to never interrupt a real
// encode; killSignal: SIGKILL gives the best real chance of the process actually
// dying the moment it becomes killable.
const FFMPEG_TIMEOUT_MS = 60 * 60_000;

async function runFfmpeg(args: string[]) {
  await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    timeout: FFMPEG_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
}

function proxyDims(format: string) {
  return format === "Reel" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
}

async function probeDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { encoding: "utf-8", timeout: 30_000, killSignal: "SIGKILL" }
    );
    const parsed = parseFloat(stdout.trim());
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function generateThumb(srcPath: string, outPath: string, isVideo: boolean, durationSec: number | null) {
  await mkdir(path.dirname(outPath), { recursive: true });
  if (isVideo) {
    const offset = durationSec ? Math.min(1, durationSec * 0.1) : 0.1;
    await runFfmpeg([
      "-ss",
      offset.toFixed(2),
      "-i",
      srcPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=960:-1:flags=lanczos",
      "-q:v",
      "3",
      outPath,
    ]);
  } else {
    await runFfmpeg(["-i", srcPath, "-vf", "scale=960:-1:flags=lanczos", "-q:v", "3", outPath]);
  }
}

async function generateVideoProxy(srcPath: string, outPath: string, format: string, watermark: boolean) {
  const { w, h } = proxyDims(format);
  const scale = `scale=${w}:${h}:flags=lanczos`;
  const hasFont = existsSync(WATERMARK_FONT);

  const vf =
    watermark && hasFont
      ? `${scale},drawtext=fontfile=${WATERMARK_FONT}:text='BJUR MEDIA . PREVIEW':fontcolor=white@0.13:fontsize=42:x=mod(t*40\\,w)-200:y=h/2:box=0`
      : scale;

  const args = [
    "-i",
    srcPath,
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-profile:v",
    "high",
    "-crf",
    "21",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    outPath,
  ];

  try {
    await runFfmpeg(args);
  } catch (err) {
    if (watermark && hasFont) {
      // Retry without the text overlay so a font/filter issue doesn't fail the whole encode.
      await runFfmpeg([...args.slice(0, 2), "-vf", scale, ...args.slice(4)]);
    } else {
      throw err;
    }
  }
}

/**
 * Turns one PENDING Asset into a streamable proxy + poster thumbnail per ENCODING.md.
 * Stills only get a thumbnail. BRAW/raw masters (which stock ffmpeg can't decode) fail
 * gracefully with an explanatory Activity log — see ENCODING.md's BRAW note.
 */
export async function generateProxy(asset: AssetRow) {
  await db.asset.update({ where: { id: asset.id }, data: { proxyStatus: "GENERATING" } });

  try {
    const srcPath = await resolveMediaPath(asset.relPath);
    const outDir = path.join(DERIVED_ROOT, asset.id);
    await mkdir(outDir, { recursive: true });

    const thumbRelPath = `${asset.id}/thumb.jpg`;
    await generateThumb(srcPath, path.join(DERIVED_ROOT, thumbRelPath), asset.kind === "VIDEO", asset.durationSec);

    // Persist the thumbnail as soon as it's ready rather than waiting on the much
    // slower full proxy encode below — with a large backlog processed one file at a
    // time, this lets the client gallery show real posters within seconds instead of
    // blank placeholders for everything still waiting on its turn to transcode.
    await db.asset.update({ where: { id: asset.id }, data: { thumbRelPath } });

    let proxyRelPath: string | null = null;
    let proxyRes: string | null = null;

    if (asset.kind === "VIDEO") {
      const watermark = asset.licensable;
      proxyRelPath = `${asset.id}/proxy.mp4`;
      const outPath = path.join(DERIVED_ROOT, proxyRelPath);
      await generateVideoProxy(srcPath, outPath, asset.format, watermark);

      // A source file can have a corrupted packet partway through (valid header/
      // duration metadata, broken bitstream data after some point) that ffmpeg just
      // quietly stops decoding at instead of erroring — exiting 0 with whatever it
      // salvaged. Without this check that silently reports as a successful, full-length
      // proxy. Comparing the encode's real output duration against the source's probed
      // duration catches it instead (confirmed case: a HandBrake-exported master with a
      // corrupt HEVC NAL unit at 5.2s produced a "Ready" 5s proxy from an 18.6s source).
      if (asset.durationSec) {
        const proxyDurationSec = await probeDuration(outPath);
        if (proxyDurationSec !== null && proxyDurationSec < asset.durationSec * 0.9 - 1) {
          throw new Error(
            `Proxy only encoded ${proxyDurationSec.toFixed(1)}s of a ${asset.durationSec}s source — the master file is likely corrupted partway through. Re-export and re-upload.`
          );
        }
      }

      const { w, h } = proxyDims(asset.format);
      proxyRes = watermark ? `watermarked ${h}p` : asset.format === "Reel" ? `${w}×${h} H.264` : `${h}p H.264`;
    }

    await db.asset.update({
      where: { id: asset.id },
      data: { proxyStatus: "READY", thumbRelPath, proxyRelPath, proxyRes },
    });

    await db.activity.create({
      data: { actor: "Worker", action: `finished proxy for "${asset.name}"` },
    });
  } catch (err) {
    await db.asset.update({ where: { id: asset.id }, data: { proxyStatus: "FAILED" } });
    await db.activity.create({
      data: {
        actor: "Worker",
        action: `Proxy generation failed for "${asset.name}": ${(err as Error).message.slice(0, 200)}`,
      },
    });
  }
}
