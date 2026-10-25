/**
 * Reads a homepage's HTML for logo candidates, in the handoff's order (§4, source 1).
 * Pure — no network — so it can be tested against a fixture. Regex rather than a DOM:
 * every signal wanted here lives in a start tag's attributes, and the only structure that
 * matters is "inside <header>".
 */

export type Candidate =
  | { kind: "url"; url: string; tier: Tier; width?: number; height?: number }
  | { kind: "svg"; svg: string; tier: Tier };

export type Tier = "header" | "apple-touch-icon" | "manifest" | "og:image" | "favicon";

export type HomepageCandidates = {
  header: Candidate[];
  appleTouch: Candidate[];
  /** The manifest's own URL; its icons need a second fetch. */
  manifestUrl: string | null;
  ogImage: Candidate | null;
  favicons: Candidate[];
};

type Attrs = Record<string, string>;

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;|&#47;/gi, "/");
}

function parseAttrs(tag: string): Attrs {
  const attrs: Attrs = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  // Skip the tag name itself.
  const body = tag.replace(/^<\s*[\w:-]+/, "").replace(/\/?>$/, "");
  for (let m; (m = re.exec(body)); ) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

function tags(html: string, name: string) {
  const re = new RegExp(`<${name}\\b[^>]*>`, "gi");
  return [...html.matchAll(re)].map((m) => ({ tag: m[0], index: m.index ?? 0, attrs: parseAttrs(m[0]) }));
}

function resolve(href: string | undefined, base: string) {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("javascript:") || h.startsWith("#")) return null;
  try {
    return new URL(h, base).toString();
  } catch {
    return null;
  }
}

/** "180x180" or "16x16 32x32 any" → the largest side; "any" (an SVG icon) counts as big. */
function largestSize(sizes: string | undefined) {
  if (!sizes) return 0;
  let best = 0;
  for (const s of sizes.toLowerCase().split(/\s+/)) {
    if (s === "any") return 1024;
    const m = /^(\d+)x(\d+)$/.exec(s);
    if (m) best = Math.max(best, Math.min(Number(m[1]), Number(m[2])));
  }
  return best;
}

/** The biggest entry of a srcset, by its w or x descriptor. */
function largestSrcset(srcset: string | undefined) {
  if (!srcset) return undefined;
  let best: { url: string; score: number } | undefined;
  for (const part of srcset.split(",")) {
    const [url, desc] = part.trim().split(/\s+/);
    if (!url) continue;
    const score = desc ? parseFloat(desc) * (desc.endsWith("x") ? 1000 : 1) : 1;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url;
}

const mentionsLogo = (...values: (string | undefined)[]) => values.some((v) => v && /logo/i.test(v));

/**
 * The part of the page a logo would be in. <header> when the site has one; otherwise
 * everything before <main>, or the top of <body> — a "logo" deep in a footer or a
 * partners strip is somebody else's.
 */
function headerScopes(html: string) {
  const headers = [...html.matchAll(/<header\b[\s\S]*?<\/header>/gi)].map((m) => m[0]);
  if (headers.length) return headers;
  const bodyStart = html.search(/<body\b/i);
  const start = bodyStart >= 0 ? bodyStart : 0;
  const mainAt = html.slice(start).search(/<main\b/i);
  const end = mainAt > 0 ? start + mainAt : Math.min(html.length, start + 60_000);
  return [html.slice(start, end)];
}

function headerCandidates(html: string, base: string): Candidate[] {
  const out: Candidate[] = [];
  for (const scope of headerScopes(html)) {
    // <img> (and <source> inside a <picture>) whose src, alt, class or id says "logo".
    for (const { attrs } of [...tags(scope, "img"), ...tags(scope, "source")]) {
      const src = attrs.src || attrs["data-src"] || largestSrcset(attrs.srcset || attrs["data-srcset"]);
      if (!mentionsLogo(src, attrs.alt, attrs.class, attrs.id, attrs.srcset)) continue;
      const url = resolve(src, base);
      if (!url) continue;
      const width = Number(attrs.width) || undefined;
      const height = Number(attrs.height) || undefined;
      out.push({ kind: "url", url, tier: "header", width, height });
    }
    // An inline <svg> marked as the logo, or sitting in a link or wrapper that is. Only
    // the 300 characters before it are looked at, which is enough for `<a class="logo">`.
    for (const m of scope.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) {
      const svg = m[0];
      const open = parseAttrs(svg.slice(0, svg.indexOf(">") + 1));
      const before = scope.slice(Math.max(0, (m.index ?? 0) - 300), m.index ?? 0);
      const lastTag = before.slice(before.lastIndexOf("<"));
      const titled = /<title[^>]*>[^<]*logo[^<]*<\/title>/i.test(svg.slice(0, 500));
      if (mentionsLogo(open.class, open.id, open["aria-label"], lastTag) || titled) {
        out.push({ kind: "svg", svg, tier: "header" });
      }
    }
  }
  // De-dupe, keeping the first (and so the most prominent) occurrence.
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = c.kind === "url" ? c.url : c.svg;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findHomepageCandidates(html: string, pageUrl: string): HomepageCandidates {
  const baseTag = tags(html, "base")[0]?.attrs.href;
  const base = resolve(baseTag, pageUrl) ?? pageUrl;
  const links = tags(html, "link");
  const rels = (a: Attrs) => (a.rel ?? "").toLowerCase().split(/\s+/);

  const appleTouch = links
    .filter(({ attrs }) => rels(attrs).some((r) => r.startsWith("apple-touch-icon")))
    .map(({ attrs }) => ({ url: resolve(attrs.href, base), size: largestSize(attrs.sizes) || 180 }))
    .filter((c): c is { url: string; size: number } => !!c.url)
    .sort((a, b) => b.size - a.size)
    .map((c): Candidate => ({ kind: "url", url: c.url, tier: "apple-touch-icon", width: c.size, height: c.size }));

  const manifestHref = links.find(({ attrs }) => rels(attrs).includes("manifest"))?.attrs.href;

  const metas = tags(html, "meta");
  const meta = (key: string) =>
    metas.find(({ attrs }) => (attrs.property ?? attrs.name ?? "").toLowerCase() === key)?.attrs.content;
  const ogUrl = resolve(meta("og:image:secure_url") || meta("og:image") || meta("twitter:image"), base);
  const ogImage: Candidate | null = ogUrl
    ? {
        kind: "url",
        url: ogUrl,
        tier: "og:image",
        width: Number(meta("og:image:width")) || undefined,
        height: Number(meta("og:image:height")) || undefined,
      }
    : null;

  const favicons = links
    .filter(({ attrs }) => rels(attrs).includes("icon"))
    .map(({ attrs }) => ({ url: resolve(attrs.href, base), size: largestSize(attrs.sizes) }))
    .filter((c): c is { url: string; size: number } => !!c.url)
    .sort((a, b) => b.size - a.size)
    .map((c): Candidate => ({ kind: "url", url: c.url, tier: "favicon", width: c.size || undefined, height: c.size || undefined }));
  const fallbackIco = resolve("/favicon.ico", base);
  if (fallbackIco && !favicons.some((f) => f.kind === "url" && f.url === fallbackIco)) {
    favicons.push({ kind: "url", url: fallbackIco, tier: "favicon" });
  }

  return {
    header: headerCandidates(html, base),
    appleTouch,
    manifestUrl: resolve(manifestHref, base),
    ogImage,
    favicons,
  };
}

/** A web app manifest's icons, largest first. Maskable-only icons are padded for a mask, so they go last. */
export function manifestIcons(json: unknown, manifestUrl: string): Candidate[] {
  const icons = (json as { icons?: { src?: string; sizes?: string; purpose?: string }[] })?.icons;
  if (!Array.isArray(icons)) return [];
  return icons
    .map((i) => ({
      url: resolve(i.src, manifestUrl),
      size: largestSize(i.sizes),
      maskable: (i.purpose ?? "").split(/\s+/).every((p) => p === "maskable"),
    }))
    .filter((i): i is { url: string; size: number; maskable: boolean } => !!i.url)
    .sort((a, b) => Number(a.maskable) - Number(b.maskable) || b.size - a.size)
    .map((i): Candidate => ({ kind: "url", url: i.url, tier: "manifest", width: i.size || undefined, height: i.size || undefined }));
}
