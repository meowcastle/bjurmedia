import { createReadStream, statSync } from "fs";
import { realpath } from "fs/promises";
import path from "path";
import { Readable } from "stream";

export const MEDIA_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.env.MEDIA_ROOT ?? "./media"
);
// These default to nesting under MEDIA_ROOT (not an independent relative path) so that
// setting only MEDIA_ROOT in production still resolves the rest correctly — an unset
// DERIVED_ROOT with an absolute MEDIA_ROOT would otherwise land under process.cwd().
export const DERIVED_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.env.DERIVED_ROOT ?? path.join(MEDIA_ROOT, "_derived")
);
export const INBOX_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.env.INBOX_ROOT ?? path.join(MEDIA_ROOT, "_inbox")
);
// The pre-existing unorganized back-catalog the Library/Import tab browses. Files here
// are registered in place (relPath keeps pointing at wherever they already sit) — see
// ARCHITECTURE.md §2: registration never moves or copies the source tree.
export const ARCHIVE_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.env.ARCHIVE_ROOT ?? path.join(MEDIA_ROOT, "_archive")
);

class PathTraversalError extends Error {}

/** Resolve a stored relPath against a root, rejecting traversal and symlink escapes. */
async function resolveWithinRoot(root: string, relPath: string) {
  const resolved = path.resolve(root, relPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new PathTraversalError(`Path escapes root: ${relPath}`);
  }
  // Also resolve symlinks so a symlinked file can't point outside root.
  const real = await realpath(resolved).catch(() => resolved);
  if (!real.startsWith(root + path.sep) && real !== root) {
    throw new PathTraversalError(`Symlink escapes root: ${relPath}`);
  }
  return resolved;
}

export function resolveMediaPath(relPath: string) {
  return resolveWithinRoot(MEDIA_ROOT, relPath);
}

export function resolveDerivedPath(relPath: string) {
  return resolveWithinRoot(DERIVED_ROOT, relPath);
}

export function resolveInboxPath(relPath: string) {
  return resolveWithinRoot(INBOX_ROOT, relPath);
}

export function resolveArchivePath(relPath: string) {
  return resolveWithinRoot(ARCHIVE_ROOT, relPath);
}

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".braw": "application/octet-stream",
};

export function mimeFor(filePath: string) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Serve a file with HTTP Range support (206 Partial Content) so <video> can scrub
 * and downloads are resumable. Never buffers the whole file into memory.
 */
export function streamFile(
  filePath: string,
  rangeHeader: string | null,
  opts: { contentType?: string; download?: string; cacheControl?: string } = {}
) {
  const stat = statSync(filePath);
  const contentType = opts.contentType ?? mimeFor(filePath);

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
    "Cache-Control": opts.cacheControl ?? "no-store",
  });
  if (opts.download) {
    headers.set("Content-Disposition", `attachment; filename="${opts.download}"`);
  }

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;

      if (start >= stat.size || end >= stat.size || start > end) {
        headers.set("Content-Range", `bytes */${stat.size}`);
        return new Response(null, { status: 416, headers });
      }

      const chunkSize = end - start + 1;
      headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      headers.set("Content-Length", String(chunkSize));

      const nodeStream = createReadStream(filePath, { start, end });
      return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
        status: 206,
        headers,
      });
    }
  }

  headers.set("Content-Length", String(stat.size));
  const nodeStream = createReadStream(filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: 200,
    headers,
  });
}
