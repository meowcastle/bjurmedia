import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { resolveMediaPath, DERIVED_ROOT } from "@/lib/media";
import { queueForCaptioning } from "@/lib/captionPipeline";
import { openReview } from "@/lib/reviews";

const execFileAsync = promisify(execFile);

const WATERMARK_FONT =
  process.env.WATERMARK_FONT ?? "/System/Library/Fonts/Supplemental/Arial Bold.ttf";

/** The mark burned into a payment-held delivery. Kept short — drawtext has no line wrap. */
const HOLD_MARK_TEXT = process.env.HOLD_MARK_TEXT ?? "BJUR MEDIA";

/**
 * "preview" is the long-standing licensing mark: a faint scrolling line over a proxy
 * nobody has bought yet. It is deliberately almost invisible — it deters reuse of a
 * preview without spoiling the client's read of the work.
 *
 * "hold" is the payment mark, and it has the opposite job: the client is being handed a
 * full-quality file they can actually use, so the mark has to be plainly there. Centred,
 * ~22% opacity, sized off the frame height so it lands the same on a 1080p reel and a 4K
 * master, with a soft shadow so it stays legible over a blown-out sky.
 */
export type MarkStyle = "none" | "preview" | "hold";

/**
 * A "hold" rendition that failed to draw its mark must never reach disk. Everything
 * downstream trusts the marked path to be marked — a silent fallback to a clean encode
 * would hand an unpaid client the finished file and look, from the outside, like the
 * feature working.
 */
const UNMARKABLE =
  "Cannot draw the watermark (font missing or drawtext failed) — refusing to write an unmarked copy down a marked path.";

function markFilter(style: MarkStyle, hasFont: boolean) {
  if (style === "none" || !hasFont) return null;
  if (style === "preview") {
    return `drawtext=fontfile=${WATERMARK_FONT}:text='BJUR MEDIA . PREVIEW':fontcolor=white@0.13:fontsize=42:x=mod(t*40\\,w)-200:y=h/2:box=0`;
  }
  return (
    `drawtext=fontfile=${WATERMARK_FONT}:text='${HOLD_MARK_TEXT}':fontcolor=white@0.22:` +
    `fontsize=h/18:x=(w-text_w)/2:y=(h-text_h)/2:` +
    `shadowcolor=black@0.22:shadowx=2:shadowy=2:box=0`
  );
}

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

/**
 * ffmpeg writes "out_time=HH:MM:SS.uuuuuu" to the -progress stream as it goes. Against a
 * known duration that is the encoder's real position in the timeline — not a guess from
 * how big the output file has got, which says nothing on a variable-bitrate encode.
 *
 * Same timeout and SIGKILL behaviour as runFfmpeg; spawn rather than execFile only
 * because the progress stream has to be read while the process is alive.
 */
async function runFfmpegWithProgress(
  args: string[],
  durationSec: number | null,
  onProgress: (pct: number) => void
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats", ...args],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    // Keep the tail of stderr: when an encode fails this is the actual reason, and the
    // command we already know we sent is not.
    let errTail = "";
    child.stderr.on("data", (d: Buffer) => {
      errTail = (errTail + d.toString()).slice(-2000);
    });

    let carry = "";
    child.stdout.on("data", (d: Buffer) => {
      carry += d.toString();
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^out_time=(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(line.trim());
        if (!m || !durationSec) continue;
        const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        // Clamp: a slightly-long encode must not report 103%.
        onProgress(Math.max(0, Math.min(99, Math.round((secs / durationSec) * 100))));
      }
    });

    const timer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(errTail.trim().split("\n").slice(-4).join(" | ") || `ffmpeg exited ${code}`));
    });
  });
}

function proxyDims(format: string) {
  return format === "Reel" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
}

/** The encode's actual geometry. Assuming the target box lies for anamorphic sources. */
async function probeDims(filePath: string): Promise<{ w: number; h: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
       "-of", "csv=p=0", filePath],
      { encoding: "utf-8", timeout: 30_000, killSignal: "SIGKILL" }
    );
    const [w, h] = stdout.trim().split(",").map(Number);
    return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null;
  } catch {
    return null;
  }
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

async function generateThumb(
  srcPath: string,
  outPath: string,
  isVideo: boolean,
  durationSec: number | null,
  style: MarkStyle = "none"
) {
  await mkdir(path.dirname(outPath), { recursive: true });
  const scaleOnly = "scale=960:-1:flags=lanczos";
  const thumbMark = markFilter(style, existsSync(WATERMARK_FONT));
  if (style === "hold" && !thumbMark) throw new Error(UNMARKABLE);
  const vf = thumbMark ? `${scaleOnly},${thumbMark}` : scaleOnly;
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
      vf,
      "-q:v",
      "3",
      outPath,
    ]);
  } else {
    await runFfmpeg(["-i", srcPath, "-vf", vf, "-q:v", "3", outPath]);
  }
}

async function generateVideoProxy(
  srcPath: string,
  outPath: string,
  format: string,
  style: MarkStyle,
  progress?: { durationSec: number | null; onPct: (pct: number) => void }
) {
  const { w, h } = proxyDims(format);
  // in_range=auto:out_range=tv normalises levels instead of passing them through.
  //
  // Some masters arrive full-range (yuvj420p / "pc") — 54 of 391 proxies on the NAS were,
  // almost all of 57's Weekly Reels. Copying that through produces a correctly-tagged
  // full-range H.264, which is legal and which players disagree about: the ones that
  // ignore the VUI flag render it as limited and crush the blacks. Converting to limited
  // here means every proxy is the one combination that is boring everywhere.
  //
  // auto, never a forced in_range: forcing pc would wreck the 337 proxies whose sources
  // are already limited. Measured both ways — a full-range source moves mean luma 103.3
  // to 104.8 (the 16 + Y*219/255 the conversion predicts), and an already-limited one
  // does not move at all.
  // Fit inside the target box instead of stretching to fill it. proxyDims is a bound now,
  // not a shape: 16:9 and vertical sources land on exactly the dimensions they always did,
  // while a 2.39:1 anamorphic master comes out 1920x804 with square pixels rather than
  // squeezed into 1920x1080 and un-squeezed again by the player's pixel aspect ratio.
  // That was never visibly wrong — ffmpeg wrote a compensating SAR — but it spent 1080
  // lines on 803 lines of picture and cost horizontal sharpness for nothing.
  // force_divisible_by=2 because yuv420p cannot have an odd dimension.
  const scale =
    `scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2` +
    `:flags=lanczos:in_range=auto:out_range=tv`;
  const hasFont = existsSync(WATERMARK_FONT);

  const mark = markFilter(style, hasFont);
  if (style === "hold" && !mark) throw new Error(UNMARKABLE);
  const vf = mark ? `${scale},${mark}` : scale;

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
    // Pin the format as well as the range: without it a full-range source keeps the
    // deprecated yuvj420p all the way to the muxer, which is where the "pc" tag comes
    // from in the first place.
    "-pix_fmt",
    "yuv420p",
    // CRF 21 was delivered-master quality, not preview quality — this is a
    // scrolling mobile proxy, not something anyone licenses. -maxrate/-bufsize
    // (VBV-constrained CRF) cap worst-case spikes on high-motion content
    // (concert/event reels especially) rather than just lowering the average —
    // spikes are usually what cause a visible stall mid-swipe on a real
    // network, not the average bitrate.
    "-crf",
    "26",
    "-maxrate",
    "4000k",
    "-bufsize",
    "8000k",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    // The fourth tag. Three of the four were already here, which is how a full-range
    // file could carry bt709 primaries and still be mis-read.
    "-color_range",
    "tv",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    outPath,
  ];

  const run = (a: string[]) =>
    progress ? runFfmpegWithProgress(a, progress.durationSec, progress.onPct) : runFfmpeg(a);

  try {
    await run(args);
  } catch (err) {
    if (mark && style === "preview") {
      // Retry without the text overlay so a font/filter issue doesn't fail the whole
      // encode. Only ever for "preview": dropping the mark from a payment-hold rendition
      // would quietly release the work.
      await run([...args.slice(0, 2), "-vf", scale, ...args.slice(4)]);
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
  await db.asset.update({
    where: { id: asset.id },
    data: { proxyStatus: "GENERATING", proxyProgress: 0 },
  });

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
      // Always clean. The only mark that survives is the payment hold's, and that one
      // lives on its own renditions so lifting the hold needs no re-encode.
      proxyRelPath = `${asset.id}/proxy.mp4`;
      const outPath = path.join(DERIVED_ROOT, proxyRelPath);
      // Throttled: ffmpeg emits progress roughly every half second, and a DB write per
      // tick on a fifteen-minute encode is a thousand pointless writes to a SQLite file
      // the web container is reading from.
      let lastWrite = 0;
      let lastPct = -1;
      await generateVideoProxy(srcPath, outPath, asset.format, "none", {
        durationSec: asset.durationSec,
        onPct: (pct) => {
          const now = Date.now();
          if (pct === lastPct || now - lastWrite < 3000) return;
          lastPct = pct;
          lastWrite = now;
          void db.asset
            .update({ where: { id: asset.id }, data: { proxyProgress: pct } })
            .catch(() => {});
        },
      });

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

      // From the file, not from proxyDims: an anamorphic master no longer lands on the
      // box dimensions, and "1080p" on a 1920x804 proxy would be a plain lie.
      const actual = await probeDims(outPath);
      const { w, h } = actual ?? proxyDims(asset.format);
      proxyRes = h === 1080 && w === 1920 ? "1080p H.264" : `${w}×${h} H.264`;
    }

    await db.asset.update({
      where: { id: asset.id },
      data: { proxyStatus: "READY", thumbRelPath, proxyRelPath, proxyRes, proxyProgress: null },
    });

    // A file that lands in a project already on a payment hold needs its marked
    // renditions before the client may take delivery of anything. Queue them for the
    // same worker loop rather than encoding them inline — the gallery should light up
    // with a poster and a proxy straight away, and the expensive full-resolution mark
    // can follow behind it.
    const owner = await db.project.findUnique({
      where: { id: asset.projectId },
      select: { paymentHold: true },
    });
    if (owner?.paymentHold) {
      await db.asset.update({ where: { id: asset.id }, data: { markStatus: "PENDING" } });
    }

    // Queue captioning once the proxy exists — the transcriber reads the proxy, not the
    // master. queueForCaptioning decides eligibility, so nothing that predates the
    // feature or falls outside it is ever picked up.
    await queueForCaptioning(asset.id).catch(() => {});

    // Open the client's review round for the same reason, and at the same moment: the
    // request email says "watch this", so it must not go out before there is something
    // to watch. openReview decides eligibility, so a non-review project is unaffected.
    await openReview(asset.id).catch(() => {});

    await db.activity.create({
      data: { actor: "Worker", action: `finished proxy for "${asset.name}"` },
    });
  } catch (err) {
    await db.asset.update({
      where: { id: asset.id },
      data: { proxyStatus: "FAILED", proxyProgress: null },
    });
    await db.activity.create({
      data: {
        actor: "Worker",
        // The message now carries ffmpeg's own stderr tail rather than the command we
        // already know we sent — the 200-char budget used to be spent entirely on the
        // command line, so the actual reason ("high profile doesn't support 4:2:2") was
        // cut off and a failure arrived with no diagnosis.
        action: `Proxy generation failed for "${asset.name}": ${(err as Error).message.slice(0, 300)}`,
      },
    });
  }
}


/** Stills keep a full-resolution marked copy: mark burned in, near-lossless JPEG. */
async function generateMarkedStill(srcPath: string, outPath: string) {
  const mark = markFilter("hold", existsSync(WATERMARK_FONT));
  if (!mark) throw new Error(UNMARKABLE);
  await runFfmpeg(["-i", srcPath, "-vf", mark, "-q:v", "2", outPath]);
}

/** Has this rendition already been made, and is it still on disk? */
function alreadyOnDisk(relPath: string | null): relPath is string {
  return !!relPath && existsSync(path.join(DERIVED_ROOT, relPath));
}

/**
 * Builds every watermarked rendition one asset needs while its project sits on a payment
 * hold: poster, and then either the marked proxy (video) or a full-resolution marked
 * still. The proxy is what Download hands over too — see markedDownloadRelPath — so there
 * is no separate delivery encode and no second phase to wait on.
 *
 * Each rendition is persisted the moment it exists rather than in one update at the end.
 * A held gallery is dark until the marked poster lands, and there is no reason to make it
 * wait on the proxy behind it. The same property makes the function resumable: a re-run
 * skips whatever is already on disk, so an asset interrupted mid-job costs only the step
 * it was on.
 *
 * Failure is safe by construction. markStatus goes FAILED, and every serving route
 * refuses rather than falling back to the clean original, so a file ffmpeg cannot decode
 * ends up undownloadable rather than accidentally released.
 */
export async function generateMarkedRenditions(asset: AssetRow) {
  try {
    await db.asset.update({ where: { id: asset.id }, data: { markStatus: "GENERATING" } });

    const srcPath = await resolveMediaPath(asset.relPath);
    await mkdir(path.join(DERIVED_ROOT, asset.id), { recursive: true });

    let markedThumbRelPath = asset.markedThumbRelPath;
    if (!alreadyOnDisk(markedThumbRelPath)) {
      markedThumbRelPath = `${asset.id}/thumb.marked.jpg`;
      await generateThumb(
        srcPath,
        path.join(DERIVED_ROOT, markedThumbRelPath),
        asset.kind === "VIDEO",
        asset.durationSec,
        "hold"
      );
      await db.asset.update({ where: { id: asset.id }, data: { markedThumbRelPath } });
    }

    if (asset.kind === "VIDEO") {
      let markedProxyRelPath = asset.markedProxyRelPath;
      if (!alreadyOnDisk(markedProxyRelPath)) {
        markedProxyRelPath = `${asset.id}/proxy.marked.mp4`;
        await generateVideoProxy(
          srcPath,
          path.join(DERIVED_ROOT, markedProxyRelPath),
          asset.format,
          "hold"
        );
        await db.asset.update({ where: { id: asset.id }, data: { markedProxyRelPath } });
      }
    } else {
      let markedFileRelPath = asset.markedFileRelPath;
      if (!alreadyOnDisk(markedFileRelPath)) {
        const ext = path.extname(asset.name).toLowerCase() === ".png" ? ".png" : ".jpg";
        markedFileRelPath = `${asset.id}/delivery.marked${ext}`;
        await generateMarkedStill(srcPath, path.join(DERIVED_ROOT, markedFileRelPath));
        await db.asset.update({ where: { id: asset.id }, data: { markedFileRelPath } });
      }
    }

    await db.asset.update({ where: { id: asset.id }, data: { markStatus: "READY" } });

    await db.activity.create({
      data: { actor: "Worker", action: `watermarked "${asset.name}" for the payment hold` },
    });
  } catch (err) {
    await db.asset.update({ where: { id: asset.id }, data: { markStatus: "FAILED" } });
    await db.activity.create({
      data: {
        actor: "Worker",
        action: `Watermarking failed for "${asset.name}": ${(err as Error).message.slice(0, 200)}`,
      },
    });
  }
}
