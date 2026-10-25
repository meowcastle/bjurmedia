import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { imageSize } from "image-size";

const execFileAsync = promisify(execFile);

/**
 * Image handling for logos, on ffmpeg — the same tool the worker already uses for every
 * thumbnail and proxy, and already in both containers (Dockerfile `base`). No new
 * native dependency for one 256px PNG a month per client.
 */

export const LOGO_SIZE = 256;
/** The smallest side a found image may have and still be used (§4: "at least 128px"). */
export const MIN_LOGO_PX = 128;
/** The colour when a logo has none of its own: all black, white or grey. */
export const LOGO_ASH = "#8C887C";

const FFMPEG_TIMEOUT_MS = 20_000;

export type ImageKind = "png" | "jpeg" | "gif" | "webp" | "ico" | "bmp" | "svg";

/** What the bytes are, from their magic numbers — a server's Content-Type is a guess. */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.toString("ascii", 0, 4) === "GIF8") return "gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "ico";
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "bmp";
  const head = buf.toString("utf8", 0, Math.min(buf.length, 1024)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || ((head.startsWith("<?xml") || head.startsWith("<!--")) && head.includes("<svg"))) {
    return "svg";
  }
  return null;
}

/**
 * Pixel size of a raster image (the largest frame of an .ico). An SVG is vector and
 * renders at any size, so it reports Infinity rather than whatever its width attr says.
 */
export function measureImage(buf: Buffer, kind: ImageKind): { width: number; height: number } | null {
  if (kind === "svg") return { width: Infinity, height: Infinity };
  try {
    const r = imageSize(new Uint8Array(buf));
    const frames = r.images?.length ? r.images : [r];
    const best = frames.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    return best.width && best.height ? { width: best.width, height: best.height } : null;
  } catch {
    return null;
  }
}

/**
 * Makes an SVG safe to hand to the rasterizer. librsvg does not run scripts and will not
 * fetch over the network, but there is no reason to pass it scripts, event handlers or
 * DTD entities (the "billion laughs" family) at all. Refuses rather than repairs anything
 * with a DOCTYPE; strips the rest.
 */
export function sanitizeSvg(svg: string): string | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) return null;
  let s = svg
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    // External references: only same-document fragments and inline data survive.
    .replace(/\s(?:xlink:)?href\s*=\s*("(?!#|data:image\/)[^"]*"|'(?!#|data:image\/)[^']*')/gi, "");
  // An inline <svg> lifted out of HTML usually has no namespace, which XML parsers require.
  if (!/<svg\b[^>]*\sxmlns=/i.test(s)) s = s.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}

async function ffmpeg(args: string[]) {
  return execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    timeout: FFMPEG_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "buffer",
  });
}

/**
 * Any accepted image → a 256×256 PNG. Square-ish images (a profile picture, an app icon)
 * are centre-cropped to square; a wide wordmark is fitted and padded with transparency
 * instead, because cropping it to a square would cut the name in half.
 */
export async function normalizeLogo(buf: Buffer, kind: ImageKind, size?: { width: number; height: number } | null) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bjur-logo-"));
  try {
    const input = path.join(dir, `in.${kind === "jpeg" ? "jpg" : kind}`);
    const output = path.join(dir, "out.png");
    let pre: string[] = [];
    if (kind === "svg") {
      const clean = sanitizeSvg(buf.toString("utf8"));
      if (!clean) throw new Error("unsafe SVG");
      await writeFile(input, clean);
      // Rasterize big and scale down, so a 40×12 intrinsic size does not come out blurry.
      // Needs an ffmpeg built with librsvg (Debian's is); otherwise this throws and the
      // caller moves on to the next candidate.
      pre = ["-c:v", "librsvg", "-width", "1024", "-height", "0", "-keep_ar", "1"];
    } else {
      await writeFile(input, buf);
    }
    const w = size?.width ?? 1;
    const h = size?.height ?? 1;
    const ratio = Number.isFinite(w) && Number.isFinite(h) ? w / h : 1;
    const squareish = kind !== "svg" && ratio >= 0.8 && ratio <= 1.25;
    const vf = squareish
      ? `crop='min(iw,ih)':'min(iw,ih)',scale=${LOGO_SIZE}:${LOGO_SIZE}:flags=lanczos,format=rgba`
      : `format=rgba,scale=${LOGO_SIZE}:${LOGO_SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `pad=${LOGO_SIZE}:${LOGO_SIZE}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
    await ffmpeg([...pre, "-i", input, "-frames:v", "1", "-vf", vf, "-pix_fmt", "rgba", output]);
    const png = await readFile(output);
    if (sniffImage(png) !== "png") throw new Error("ffmpeg produced no PNG");
    return png;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Decodes a PNG to a small RGBA grid for colour picking. */
async function sampleRgba(png: Buffer, side = 64) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bjur-logo-"));
  try {
    const input = path.join(dir, "in.png");
    await writeFile(input, png);
    const { stdout } = await ffmpeg([
      "-i", input, "-frames:v", "1", "-vf", `scale=${side}:${side}:flags=area,format=rgba`,
      "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
    ]);
    return stdout as unknown as Buffer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * The most saturated mid-tone colour in an RGBA buffer, or ash.
 *
 * Pixels are grouped into coarse colour buckets first, so a few anti-aliased edge pixels
 * cannot win on their own: a bucket needs a real share of the logo (1.5% of its opaque
 * pixels) to count. Among those, the most saturated mid-tone bucket wins, and its average
 * colour is returned. "Saturated" is measured as chroma (max − min channel) rather than
 * HSL saturation, which calls a near-black navy fully saturated; "mid-tone" keeps out the
 * near-black and near-white that are on every logo and say nothing about the brand.
 */
export function pickLogoColor(rgba: Uint8Array): string {
  type Bucket = { n: number; r: number; g: number; b: number };
  const buckets = new Map<number, Bucket>();
  let opaque = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 200) continue;
    opaque++;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bk.n++; bk.r += r; bk.g += g; bk.b += b;
    buckets.set(key, bk);
  }
  if (opaque === 0) return LOGO_ASH;

  let best: { score: number; hex: string } | null = null;
  for (const bk of buckets.values()) {
    const share = bk.n / opaque;
    if (share < 0.015) continue;
    const r = bk.r / bk.n, g = bk.g / bk.n, b = bk.b / bk.n;
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const chroma = max - min;
    if (l < 0.2 || l > 0.85 || chroma < 0.2) continue;
    // Chroma decides; share only breaks near-ties.
    const score = chroma + Math.min(share, 0.25) * 0.4;
    if (!best || score > best.score) best = { score, hex: toHex(r, g, b) };
  }
  return best?.hex ?? LOGO_ASH;
}

export async function logoColorOf(png: Buffer) {
  return pickLogoColor(new Uint8Array(await sampleRgba(png)));
}
