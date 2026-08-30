import type { WriteStream } from "fs";
import path from "path";

/** Strip directory components and separators from a client-supplied filename (path traversal). */
export function sanitizeFilename(name: string) {
  const base = path.basename(name).trim();
  return base.replace(/[/\\]/g, "_") || "upload";
}

/**
 * Pump a Web ReadableStream reader into a Node write stream by hand, backpressure-aware.
 * Deliberately not Readable.fromWeb(req.body) + pipeline() — that conversion has
 * documented double-buffering/highWaterMark bugs (nodejs/node#48636, #47128, #49938)
 * that can make the resulting Node stream emit 'end' early on large transfers, with no
 * error thrown, well before the underlying Web ReadableStream is actually exhausted.
 * Confirmed in production on the admin upload route this was extracted from: packet
 * captures showed the full file arriving intact at this process's own socket, while
 * Readable.fromWeb's stream still ended ~45MB short on a 55MB upload.
 */
export async function pumpToFile(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writeStream: WriteStream
) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!writeStream.write(value)) {
      await new Promise<void>((resolve) => writeStream.once("drain", () => resolve()));
    }
  }
  await new Promise<void>((resolve, reject) => {
    writeStream.end((err: NodeJS.ErrnoException | null | undefined) => (err ? reject(err) : resolve()));
  });
}
