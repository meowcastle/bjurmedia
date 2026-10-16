import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, truncateSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { ZipArchive } from "archiver";
import { storedZipSize } from "../src/lib/zipSize";

/**
 * Download all sends a Content-Length computed in advance (src/lib/zipSize.ts). A wrong
 * number truncates or kills the download, so the calculation is checked byte-for-byte
 * against what archiver really writes. Set ZIP_SIZE_BIG=1 to include a 4.3 GiB sparse
 * file (zip64; about six seconds) — do that after any archiver upgrade.
 */
type F = { path: string; name: string; size: number };

let dir: string;
test.beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "zip-size-"));
});
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, size: number, sparse = false): F {
  const p = path.join(dir, `${Math.random().toString(36).slice(2)}`);
  if (sparse) {
    writeFileSync(p, "");
    truncateSync(p, size);
  } else writeFileSync(p, Buffer.alloc(size, 7));
  return { path: p, name, size };
}

async function realSize(files: F[]) {
  const archive = new ZipArchive({ store: true, statConcurrency: 1 });
  let n = 0;
  const sink = new Writable({
    write(chunk, _enc, cb) {
      n += chunk.length;
      cb();
    },
  });
  const done = new Promise((r) => sink.on("finish", r));
  archive.pipe(sink);
  for (const f of files) archive.file(f.path, { name: f.name });
  await archive.finalize();
  await done;
  return n;
}

const cases: [string, () => F[]][] = [
  ["ascii names", () => [file("Reel/a.mp4", 1234), file("Still/b.jpg", 99_999)]],
  ["unicode names", () => [file("Reel/Café — Señor ✦.mp4", 5000), file("Film/日本語.mov", 10)]],
  ["an empty file", () => [file("Reel/empty.mp4", 0), file("Reel/x.mp4", 3)]],
  ["two hundred files", () => Array.from({ length: 200 }, (_, i) => file(`Still/IMG_${i}.jpg`, (i * 997) % 50_000))],
];
if (process.env.ZIP_SIZE_BIG) {
  cases.push([
    "a file over 4 GiB (zip64)",
    () => [file("Film/huge.mov", Math.round(4.3 * 1024 ** 3), true), file("Reel/after.mp4", 777)],
  ]);
}

for (const [label, make] of cases) {
  test(`computed zip size matches archiver: ${label}`, async () => {
    test.setTimeout(120_000);
    const files = make();
    expect(storedZipSize(files.map(({ name, size }) => ({ name, size })))).toBe(await realSize(files));
  });
}

test.describe("Download all", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("sends a Content-Length that is exactly the body it sends", async ({ request }) => {
    // Two of p1's masters, written where the seed says they are; the rest are absent on
    // disk under test and are left out of the zip.
    const media = path.join(__dirname, "..", "media-e2e", "SSH", "Spring-Campaign", "2026-06");
    const written = [path.join(media, "Reel", "SSH_Reel_Hero.mp4"), path.join(media, "Still", "SSH_Still_012.jpg")];
    for (const p of written) {
      mkdirSync(path.dirname(p), { recursive: true });
      if (!existsSync(p)) writeFileSync(p, Buffer.alloc(150_000, 3));
    }
    try {
      const res = await request.get("/api/projects/p1/download-all");
      expect(res.status()).toBe(200);
      const body = await res.body();
      expect(Number(res.headers()["content-length"])).toBe(body.length);
      expect(body.length).toBeGreaterThan(300_000);
    } finally {
      for (const p of written) rmSync(p, { force: true });
    }
  });
});
