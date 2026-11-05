// Takes a copy of the public pages of each site while the NAS is up, for
// src/worker.js to serve if it later goes offline. Runs on Cloudflare's build
// machine on every deploy, so the copy is as fresh as the last deploy: to
// refresh it before planned downtime, retry the latest deployment.
//
// It starts at / and the sitemap, follows links on the same site, and saves
// every page, image, stylesheet and script it finds. Nothing that needs the
// server (API calls, forms, the staging gate) is copied.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SITES = ['bjur.nyc', 'justinbjur.com'];
const MAX_FILES_PER_SITE = 3000;
const MAX_BYTES = 24 * 1024 * 1024; // Cloudflare's limit per file is 25 MiB.
const SKIP = [/^\/api\//, /^\/gate(\/|$)/, /^\/in-/, /[?&]_rsc=/];
const PARALLEL = 6;

const TYPES = {
  'text/html': 'html', 'text/css': 'css', 'text/javascript': 'js', 'application/javascript': 'js',
  'application/json': 'json', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/avif': 'avif', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico', 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf',
  'text/plain': 'txt', 'application/xml': 'xml', 'text/xml': 'xml', 'application/manifest+json': 'webmanifest',
};

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
const manifest = { built: new Date().toISOString(), hosts: {} };

for (const host of SITES) {
  const table = (manifest.hosts[host] = {});
  const seen = new Set();
  const queue = ['/'];
  const sameHost = (h) => h === host || h === 'www.' + host;

  const add = (raw, base) => {
    if (!raw) return;
    raw = raw.trim().replace(/&amp;/g, '&');
    if (/^(mailto:|tel:|sms:|javascript:|data:|blob:|#)/i.test(raw)) return;
    let u;
    try { u = new URL(raw, base); } catch { return; }
    if (!/^https?:$/.test(u.protocol) || !sameHost(u.hostname)) return;
    const key = u.pathname + u.search;
    if (seen.has(key) || SKIP.some((r) => r.test(key))) return;
    seen.add(key);
    queue.push(key);
  };

  // The sitemap lists the pages that matter even if nothing links to them.
  try {
    const sm = await (await fetch(`https://${host}/sitemap.xml`)).text();
    for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) add(m[1], `https://${host}/`);
  } catch {}
  seen.add('/');

  let saved = 0, bytes = 0;
  const one = async (key) => {
    const base = `https://${host}${key}`;
    let res;
    try { res = await fetch(base, { headers: { 'user-agent': 'bjur-backup-builder' } }); } catch { return; }
    if (!res.ok) return;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return;
    const ext = TYPES[type] || (key.split('?')[0].match(/\.([a-z0-9]{1,6})$/i)?.[1] ?? 'bin');
    const file = createHash('sha1').update(host + key).digest('hex').slice(0, 20) + '.' + ext;
    writeFileSync('dist/' + file, buf);
    table[key] = file;
    saved++; bytes += buf.length;

    if (ext === 'html' || ext === 'css' || ext === 'js') {
      const text = buf.toString('utf8');
      if (ext === 'html') {
        for (const m of text.matchAll(/\s(?:href|src|content|poster|data-src)=["']([^"']+)["']/gi)) add(m[1], base);
        for (const m of text.matchAll(/\ssrcset=["']([^"']+)["']/gi))
          for (const part of m[1].split(/,\s+/)) add(part.trim().split(/\s+/)[0], base);
      }
      for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(m[1], base);
      // Next.js names its script and style chunks inside other chunks.
      for (const m of text.matchAll(/["'(](\/_next\/static\/[^"'()\s\\]+)/g)) add(m[1], base);
      for (const m of text.matchAll(/["'](static\/(?:chunks|css|media)\/[^"'\s\\]+)/g)) add('/_next/' + m[1], base);
    }
  };

  while (queue.length && saved < MAX_FILES_PER_SITE) {
    const batch = queue.splice(0, PARALLEL);
    await Promise.all(batch.map(one));
  }
  console.log(`${host}: ${saved} files, ${(bytes / 1e6).toFixed(1)} MB, pages: ${Object.entries(table).filter(([, f]) => f.endsWith('.html')).map(([k]) => k).join(' ')}`);
  if (!table['/']) throw new Error(`${host}: could not copy the home page, stopping so a broken backup is not deployed`);
}

writeFileSync('src/manifest.json', JSON.stringify(manifest));
console.log('manifest written', manifest.built);
