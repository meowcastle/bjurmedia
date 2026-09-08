/**
 * Big-transfer harness for the client upload path.
 *
 * Drives exactly what the browser does — 16MB chunks, resuming from the server's own
 * receivedBytes rather than a local counter — so what this proves is what a real client
 * delivery will do. The point is to find the limits of the network, the reverse proxy
 * and the NAS before a client does, on a transfer big enough to matter.
 *
 * Synthetic data is streamed rather than written to a file first: a 50GB fixture on the
 * laptop would be the slowest part of the test and proves nothing extra. The SHA-256 is
 * computed as the bytes go out, so it can be compared with the file on the NAS after.
 *
 *   BJUR_EMAIL=you@example.com BJUR_PASSWORD=... \
 *     npx tsx scripts/transfer-test.ts --project <id> --size 20GB
 *
 * Credentials come from the environment and are never written anywhere.
 */
import crypto from "node:crypto";

const CHUNK = 16 * 1024 * 1024; // must match SubmissionUploadClient
const MAX_RETRIES = 8;

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined && fallback === undefined) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return v ?? fallback!;
}

function parseSize(s: string) {
  const m = /^(\d+(?:\.\d+)?)\s*(GB|MB)$/i.exec(s.trim());
  if (!m) {
    console.error(`--size must look like "20GB" or "500MB", got ${s}`);
    process.exit(1);
  }
  const n = Number(m[1]);
  return Math.round(n * (m[2].toUpperCase() === "GB" ? 1024 ** 3 : 1024 ** 2));
}

const BASE = arg("url", "https://portal.justinbjur.com").replace(/\/$/, "");
const PROJECT = arg("project");
const TOTAL = parseSize(arg("size", "20GB"));
const NAME = arg("name", `transfer-test-${Date.now()}.bin`);

const EMAIL = process.env.BJUR_EMAIL;
const PASSWORD = process.env.BJUR_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set BJUR_EMAIL and BJUR_PASSWORD in the environment.");
  process.exit(1);
}

function fmt(bytes: number) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Deterministic filler. Cheap enough not to be the bottleneck, unlike randomBytes. */
function fill(buf: Buffer, offset: number) {
  for (let i = 0; i < buf.length; i += 8) {
    buf.writeUInt32LE((offset + i) >>> 0, i);
    buf.writeUInt32LE(((offset + i) * 2654435761) >>> 0, i + 4);
  }
  return buf;
}

async function main() {
  console.log(`→ ${BASE}`);
  console.log(`  project ${PROJECT}`);
  console.log(`  sending ${fmt(TOTAL)} as ${NAME}\n`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, portal: "client" }),
  });
  if (!login.ok) {
    console.error(`login failed: ${login.status} ${await login.text()}`);
    process.exit(1);
  }
  const cookie = (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) {
    console.error("login succeeded but returned no session cookie");
    process.exit(1);
  }
  const headers = { cookie };

  const batchRes = await fetch(`${BASE}/api/projects/${PROJECT}/upload-batches`, {
    method: "POST",
    headers,
  });
  if (!batchRes.ok) {
    console.error(`could not start an upload batch: ${batchRes.status} ${await batchRes.text()}`);
    console.error("(is 'Accept client uploads' on for this project?)");
    process.exit(1);
  }
  const batch = (await batchRes.json()) as { id: string; label: string };

  const createRes = await fetch(`${BASE}/api/projects/${PROJECT}/submissions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ batchId: batch.id, relativePath: NAME, sizeBytes: TOTAL }),
  });
  if (!createRes.ok) {
    console.error(`could not create the submission: ${createRes.status} ${await createRes.text()}`);
    process.exit(1);
  }
  const { id: submissionId } = (await createRes.json()) as { id: string };
  console.log(`  batch ${batch.label} · submission ${submissionId}\n`);

  const hash = crypto.createHash("sha256");
  const url = `${BASE}/api/projects/${PROJECT}/submissions/${submissionId}/chunk`;
  const started = Date.now();
  let offset = 0;
  let lastLog = 0;
  const window: { t: number; bytes: number }[] = [];

  while (offset < TOTAL) {
    const end = Math.min(offset + CHUNK, TOTAL);
    const body = fill(Buffer.allocUnsafe(end - offset), offset);

    let ok = false;
    for (let attempt = 1; attempt <= MAX_RETRIES && !ok; attempt++) {
      try {
        const res = await fetch(url, {
          method: "PUT",
          headers: { ...headers, "Content-Range": `bytes ${offset}-${end - 1}/${TOTAL}` },
          body: new Uint8Array(body),
        });
        if (!res.ok) {
          // 4xx that is not a timeout or rate limit will fail identically on a retry.
          if (res.status < 500 && res.status !== 408 && res.status !== 429) {
            console.error(`\nchunk at ${offset} refused: ${res.status} ${await res.text()}`);
            process.exit(1);
          }
          throw new Error(`${res.status}`);
        }
        const json = (await res.json()) as { receivedBytes: number };
        // Trust the server's count, never a local one — that is what makes a resume
        // after a dropped connection land in the right place.
        if (json.receivedBytes !== end) {
          console.error(`\nserver holds ${json.receivedBytes}, expected ${end} — stopping`);
          process.exit(1);
        }
        hash.update(body);
        offset = json.receivedBytes;
        ok = true;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.error(`\nchunk at ${offset} failed after ${MAX_RETRIES} attempts: ${err}`);
          process.exit(1);
        }
        const wait = Math.min(30_000, 500 * 2 ** attempt);
        process.stdout.write(`\n  retry ${attempt} at ${fmt(offset)} in ${wait}ms…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    const now = Date.now();
    window.push({ t: now, bytes: end - (offset - (end - offset)) });
    while (window.length && now - window[0].t > 10_000) window.shift();

    if (now - lastLog > 2000 || offset >= TOTAL) {
      lastLog = now;
      const secs = (now - started) / 1000;
      const rate = offset / secs;
      const pct = ((offset / TOTAL) * 100).toFixed(1);
      process.stdout.write(
        `\r  ${pct}%  ${fmt(offset)} / ${fmt(TOTAL)}  ·  ${(rate / 1024 ** 2).toFixed(1)} MB/s  ·  ETA ${clock(
          (TOTAL - offset) / rate
        )}          `
      );
    }
  }

  const secs = (Date.now() - started) / 1000;
  console.log(`\n\n✓ sent ${fmt(TOTAL)} in ${clock(secs)} — ${(TOTAL / secs / 1024 ** 2).toFixed(1)} MB/s average`);
  console.log(`  sha256 (as sent): ${hash.digest("hex")}`);
  console.log(`\n  Verify on the NAS:`);
  console.log(`    ssh justin@192.168.1.117 "find /volume2/BJURMEDIA/_submissions -name \\"${NAME}\\" -exec sha256sum {} +"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
