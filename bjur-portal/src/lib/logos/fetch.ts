import { lookup } from "dns/promises";
import net from "net";

/**
 * Fetching for the logo job. Every URL here comes from somebody else's HTML, or from a
 * domain typed into a login's email address, and the worker runs inside the NAS's own
 * network — so redirects are followed by hand and every hop is refused if it resolves to
 * a private address. Bodies are capped and every request has a deadline: one slow or
 * enormous site must not stall the queue behind it.
 */

export const USER_AGENT = "BJUR-Portal-LogoFinder/1.0 (+https://bjur.nyc; finds a client's own logo once a month)";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

export type Fetched = { url: string; contentType: string; body: Buffer };

function isPrivateAddress(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicHost(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`refusing ${url.protocol} URL`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`refusing ${host}: resolves to a private address`);
  }
}

async function readCapped(res: Response, maxBytes: number) {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`too large (${declared} bytes)`);
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error(`too large (over ${maxBytes} bytes)`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** GET with redirects followed by hand (each hop checked), a deadline and a size cap. */
export async function safeFetch(
  input: string,
  opts: { maxBytes: number; accept?: string; headers?: Record<string, string> },
): Promise<Fetched> {
  let url = new URL(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: opts.accept ?? "*/*", ...opts.headers },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel().catch(() => {});
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await readCapped(res, opts.maxBytes);
      return { url: url.toString(), contentType: (res.headers.get("content-type") ?? "").toLowerCase(), body };
    }
    throw new Error("too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

export function fetchHtml(url: string) {
  return safeFetch(url, { maxBytes: MAX_HTML_BYTES, accept: "text/html,application/xhtml+xml" });
}

export function fetchImage(url: string) {
  return safeFetch(url, { maxBytes: MAX_IMAGE_BYTES, accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/*;q=0.8" });
}

export async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const r = await safeFetch(url, { maxBytes: MAX_HTML_BYTES, accept: "application/json", headers });
  return JSON.parse(r.body.toString("utf8")) as T;
}
