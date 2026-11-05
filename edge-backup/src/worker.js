// Outage cover for bjur.nyc and justinbjur.com.
//
// Every request still goes to the NAS first, exactly as before. Only when
// Cloudflare cannot reach it (NAS off, tunnel down, home internet out) does
// this answer instead, from the copy build.mjs took on the last deploy.
// Pages and images load as normal; anything that needs the server (forms,
// bookings, API calls) gets a 503 until the NAS is back.
import manifest from './manifest.json';

// What Cloudflare returns when it cannot reach the origin: 530 is the tunnel
// down, the 52x family the rest. A 502 or 503 from the NAS itself passes
// through like any other response.
const ORIGIN_DOWN = new Set([520, 521, 522, 523, 524, 525, 526, 530]);

export default {
  async fetch(request, env, ctx) {
    // If this script itself throws, Cloudflare sends the request straight on
    // to the NAS as if the Worker were not there.
    ctx.passThroughOnException();
    let res = null;
    try {
      res = await fetch(request);
    } catch (e) {
      res = null;
    }
    if (res && !ORIGIN_DOWN.has(res.status)) return res;
    return backup(request, new URL(request.url), env);
  },
};

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Bjur-Backup': '1' };

export async function backup(request, url, env) {
  const host = url.hostname.replace(/^www\./, '');
  const table = manifest.hosts[host];

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503, headers: { ...NO_STORE, 'Content-Type': 'application/json', 'Retry-After': '120' },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Temporarily unavailable', { status: 503, headers: { ...NO_STORE, 'Retry-After': '120' } });
  }

  const file = table && lookup(table, url);
  if (!file) return offlinePage(host);

  const asset = await env.ASSETS.fetch(new Request(new URL('/' + file, url.origin), { method: request.method }));
  if (!asset.ok) return offlinePage(host);
  const out = new Response(asset.body, asset);
  for (const [k, v] of Object.entries(NO_STORE)) out.headers.set(k, v);
  return out;
}

export function lookup(table, url) {
  const p = url.pathname;
  const trimmed = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
  return table[p + url.search] || table[trimmed + url.search] || table[p] || table[trimmed] || null;
}

function offlinePage(host) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back shortly</title>
<style>:root{--paper:#f4f1e8;--ink:#1a1a1a;--ash:#7a776e;--shu:#c8371f}@media (prefers-color-scheme:dark){:root{--paper:#141412;--ink:#f2eee4;--ash:#9a978e;--shu:#e04a2e}}
html,body{margin:0;height:100%;background:var(--paper);color:var(--ink);font:500 15px/1.5 ui-monospace,"IBM Plex Mono",Menlo,monospace}
main{min-height:100%;display:grid;place-content:center;gap:12px;padding:24px;text-align:center}
h1{font:700 28px/1.2 system-ui,sans-serif;margin:0}p{margin:0;color:var(--ash)}i{display:block;width:44px;height:44px;margin:0 auto 8px;background:var(--shu);border-radius:3px;transform:rotate(-3deg)}</style></head>
<body><main><i></i><h1>Back shortly.</h1><p>${host} is offline for a moment. Please try again in a little while.</p></main></body></html>`;
  return new Response(html, { status: 503, headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '300' } });
}
