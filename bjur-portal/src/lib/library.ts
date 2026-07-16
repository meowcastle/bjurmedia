import { readdir, stat } from "fs/promises";
import path from "path";
import { ARCHIVE_ROOT, resolveArchivePath } from "@/lib/media";

export type ArchiveEntry = { name: string; path: string; isFolder: boolean; size?: number };

/** One level of the archive tree, for lazy expand-on-click browsing. */
export async function listArchiveDir(relDir: string): Promise<ArchiveEntry[]> {
  const abs = await resolveArchivePath(relDir);
  const entries = await readdir(abs, { withFileTypes: true });

  const results = await Promise.all(
    entries
      .filter((e) => !e.name.startsWith("."))
      .map(async (e) => {
        const entryRel = path.join(relDir, e.name);
        if (e.isDirectory()) {
          return { name: e.name, path: entryRel, isFolder: true };
        }
        const s = await stat(path.join(abs, e.name));
        return { name: e.name, path: entryRel, isFolder: false, size: s.size };
      })
  );

  return results.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1));
}

/** All files nested under relDir, for "pick whole folder". */
export async function listArchiveFilesRecursive(relDir: string): Promise<ArchiveEntry[]> {
  const entries = await listArchiveDir(relDir);
  const files: ArchiveEntry[] = [];
  for (const e of entries) {
    if (e.isFolder) {
      files.push(...(await listArchiveFilesRecursive(e.path)));
    } else {
      files.push(e);
    }
  }
  return files;
}

export function archiveRootLabel() {
  return ARCHIVE_ROOT;
}
