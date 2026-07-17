import { execFileSync } from "child_process";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { resolveMediaPath, DERIVED_ROOT } from "@/lib/media";

const WATERMARK_FONT =
  process.env.WATERMARK_FONT ?? "/System/Library/Fonts/Supplemental/Arial Bold.ttf";

type AssetRow = Awaited<ReturnType<typeof db.asset.findFirstOrThrow>>;

// Real transcodes of this studio's short-form content legitimately take a few
// minutes on the NAS's CPU, but with no timeout at all a single corrupted/unusual
// input can hang ffmpeg forever — and since this call is synchronous, that freezes
// the whole worker process (ingest, other proxies, everything) with no way out short
// of a manual restart. An hour is generous enough to never interrupt a real encode.
const FFMPEG_TIMEOUT_MS = 60 * 60_000;

function runFfmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: FFMPEG_TIMEOUT_MS,
  });
}

function proxyDims(format: string) {
  return format === "Reel" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
}

async function generateThumb(srcPath: string, outPath: string, isVideo: boolean, durationSec: number | null) {
  await mkdir(path.dirname(outPath), { recursive: true });
  if (isVideo) {
    const offset = durationSec ? Math.min(1, durationSec * 0.1) : 0.1;
    runFfmpeg([
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
    runFfmpeg(["-i", srcPath, "-vf", "scale=960:-1:flags=lanczos", "-q:v", "3", outPath]);
  }
}

function generateVideoProxy(srcPath: string, outPath: string, format: string, watermark: boolean) {
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
    runFfmpeg(args);
  } catch (err) {
    if (watermark && hasFont) {
      // Retry without the text overlay so a font/filter issue doesn't fail the whole encode.
      runFfmpeg([...args.slice(0, 2), "-vf", scale, ...args.slice(4)]);
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
      generateVideoProxy(srcPath, path.join(DERIVED_ROOT, proxyRelPath), asset.format, watermark);
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
