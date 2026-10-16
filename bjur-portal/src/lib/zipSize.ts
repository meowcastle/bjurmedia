/**
 * The exact byte length of the zip that archiver (zip-stream / compress-commons 7) writes
 * for a set of files in store mode, so Download all can send a Content-Length and phones
 * show a real progress bar and time remaining instead of an endless spinner.
 *
 * This mirrors compress-commons' ZipArchiveOutputStream, entry by entry. Every file is
 * appended as a stream, so each gets a data descriptor; an entry over 4 GiB takes 8-byte
 * sizes there and a 28-byte zip64 extra in the central directory; the archive takes the
 * zip64 end records once it holds more than 65,535 entries or its central directory sits
 * past 4 GiB. A wrong number here does not degrade gracefully — the browser truncates or
 * rejects the download — so e2e/zip-size checks it byte-for-byte against real output,
 * including a file over 4 GiB. Bump that check if archiver is upgraded.
 */
const MAGIC = 0xffffffff;
const MAGIC_SHORT = 0xffff;

/** Same normalisation compress-commons applies to entry names before writing them. */
function nameBytes(name: string) {
  const n = name.replace(/\\/g, "/").replace(/^\w+:/, "").replace(/^(\.\.\/|\/)+/, "");
  return Buffer.byteLength(n, "utf8");
}

export function storedZipSize(entries: { name: string; size: number }[]) {
  let offset = 0;
  const central: { name: number; zip64: boolean }[] = [];
  for (const e of entries) {
    const name = nameBytes(e.name);
    const entryZip64 = e.size > MAGIC;
    const fileOffset = offset;
    offset += 30 + name; // local file header, no extra
    offset += e.size; // stored: the bytes as they are
    offset += entryZip64 ? 24 : 16; // data descriptor
    central.push({ name, zip64: entryZip64 || fileOffset > MAGIC });
  }
  const centralOffset = offset;
  for (const c of central) offset += 46 + c.name + (c.zip64 ? 28 : 0);
  const centralLength = offset - centralOffset;
  const archiveZip64 =
    entries.length > MAGIC_SHORT || centralLength > MAGIC || centralOffset > MAGIC;
  if (archiveZip64) offset += 56 + 20; // zip64 end of central directory + locator
  return offset + 22; // end of central directory, no comment
}
