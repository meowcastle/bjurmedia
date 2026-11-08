import type { Prisma } from "@prisma/client";

/**
 * Raw camera originals. Stock ffmpeg cannot decode any of them (BRAW needs Blackmagic's
 * SDK, R3D and ARRIRAW their vendors'), so they never get a poster, a proxy or a
 * watermark — see ENCODING.md's BRAW note.
 */
export const RAW_CAMERA_EXT = [".braw", ".r3d", ".ari"] as const;

/** Production sound delivered beside the camera originals on a RAW project. */
export const AUDIO_EXT = [".wav", ".bwf", ".aif", ".aiff", ".mp3", ".m4a", ".flac"] as const;

function extOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function isRawCamera(name: string) {
  return (RAW_CAMERA_EXT as readonly string[]).includes(extOf(name));
}

/**
 * Assets that are delivered as files and nothing else: production audio, and raw camera
 * originals. Everything the portal does to a picture — poster, streaming proxy, caption
 * transcript, swipe viewer, the payment hold's burned-in mark — has nothing to work with
 * here, so these are listed as plain file rows and handed over as the original.
 *
 * Decided by kind and file extension, deliberately not by format === "Master". The
 * library importer lets staff tag any file Master (a ProRes .mov, say), and that file
 * still decodes, proxies and marks like any other video. Only the extension says whether
 * ffmpeg can open it.
 *
 * Kept free of server imports so client components can ask the same question the routes
 * do — a gallery that guessed differently from the download route would draw a play
 * button on a file that can only ever 404.
 */
export function isFileOnly(asset: { kind: string; name: string }) {
  return asset.kind === "AUDIO" || isRawCamera(asset.name);
}

/**
 * isFileOnly as a Prisma filter, for the queries that have to leave these rows alone
 * (marking queues, marking progress). endsWith is LIKE on SQLite, which ignores ASCII
 * case, so A001_C002.BRAW matches as well as .braw.
 */
export const fileOnlyWhere: Prisma.AssetWhereInput = {
  OR: [{ kind: "AUDIO" }, ...RAW_CAMERA_EXT.map((ext) => ({ name: { endsWith: ext } }))],
};
