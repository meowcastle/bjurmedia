import { db } from "@/lib/db";
import { refreshAccessToken, youtubeOAuthConfigured } from "@/lib/youtubeAuth";
import { fetchHtml, fetchImage, fetchJson, safeFetch, MAX_HTML_BYTES, type Fetched } from "./fetch";
import { findHomepageCandidates, manifestIcons, type Candidate } from "./html";
import { measureImage, MIN_LOGO_PX, normalizeLogo, sniffImage } from "./image";

/**
 * The four places a logo can come from, in the handoff's order (§4). Each returns a
 * finished 256px PNG and the source string to record, or null to move on. None of them
 * throws for an ordinary miss — a site that is down, a handle that is not a business
 * account, a missing key — those are just "not here".
 */

export type FoundLogo = {
  png: Buffer;
  source: string;
  /**
   * A long wordmark (wider than 2.5:1). Usable, but it shrinks to a sliver in a 40px
   * avatar, so the resolver keeps it as a last resort and asks the other sources first.
   */
  wide?: boolean;
};

const WIDE_RATIO = 2.5;
type Got = { png: Buffer; ratio: number };
type Log = (msg: string) => void;

/**
 * Webmail and the studio's own domains. A login at one of these says nothing about whose
 * logo to look for — the homepage of gmail.com is Google's.
 */
const NOT_A_BRAND = new Set([
  "gmail.com", "googlemail.com", "icloud.com", "me.com", "mac.com",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com", "passport.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com", "aol.com", "aim.com",
  "proton.me", "protonmail.com", "protonmail.ch", "pm.me",
  "gmx.com", "gmx.net", "gmx.de", "mail.com", "zoho.com", "zohomail.com",
  "fastmail.com", "fastmail.fm", "hey.com", "tutanota.com", "tuta.io",
  "yandex.com", "yandex.ru", "mail.ru", "qq.com", "163.com", "126.com",
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "optonline.net",
  "duck.com", "privaterelay.appleid.com", "hushmail.com",
  // The studio's own domains: staff logins sit on client accounts, and their address
  // says nothing about the client's brand.
  "bjur.nyc", "bjur.media", "bjurmedia.nyc", "wreckroom.nyc", "justinbjur.com",
]);

export function isBrandDomain(domain: string) {
  const d = domain.toLowerCase().trim();
  if (!d.includes(".")) return false;
  // Yahoo, Hotmail and friends have a long tail of country domains (yahoo.fr, hotmail.it…).
  if (/^(yahoo|hotmail|outlook|live|gmx|web|t-online|libero|orange|free|laposte)\.[a-z.]+$/.test(d)) return false;
  return !NOT_A_BRAND.has(d);
}

export function cleanDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

/** websiteDomain if set, else the domain of the first login (oldest first) that is not webmail. */
export async function brandDomainFor(clientId: string, websiteDomain: string | null) {
  if (websiteDomain?.trim()) return cleanDomain(websiteDomain);
  const members = await db.clientMember.findMany({
    where: { clientId, user: { deactivatedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { email: true } } },
  });
  for (const m of members) {
    const domain = m.user.email.split("@")[1];
    if (domain && isBrandDomain(domain)) return cleanDomain(domain);
  }
  return null;
}

/**
 * Downloads one candidate and turns it into the 256px PNG, or says why not.
 * `requireSquare` is og:image's rule: a 1200×630 share card is a photo, not a logo.
 */
async function tryCandidate(c: Candidate, log: Log, opts: { requireSquare?: boolean } = {}): Promise<Got | null> {
  try {
    let body: Buffer;
    if (c.kind === "svg") {
      body = Buffer.from(c.svg, "utf8");
    } else if (c.url.startsWith("data:")) {
      const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(c.url);
      if (!m) return null;
      body = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
    } else {
      body = (await fetchImage(c.url)).body;
    }
    const kind = sniffImage(body);
    if (!kind) {
      log(`  skip ${c.tier} ${describe(c)}: not an image`);
      return null;
    }
    const size = measureImage(body, kind);
    if (!size) return null;
    if (Math.max(size.width, size.height) < MIN_LOGO_PX) {
      log(`  skip ${c.tier} ${describe(c)}: ${size.width}×${size.height}, under ${MIN_LOGO_PX}px`);
      return null;
    }
    if (opts.requireSquare) {
      const ratio = size.width / size.height;
      if (!(ratio >= 0.8 && ratio <= 1.25)) {
        log(`  skip ${c.tier} ${describe(c)}: ${size.width}×${size.height}, not square`);
        return null;
      }
    }
    const ratio = Number.isFinite(size.width) ? size.width / size.height : svgRatio(body);
    return { png: await normalizeLogo(body, kind, size), ratio };
  } catch (err) {
    log(`  skip ${c.tier} ${describe(c)}: ${(err as Error).message.slice(0, 120)}`);
    return null;
  }
}

/** An SVG's aspect ratio from its viewBox or width/height, or 1 when it does not say. */
function svgRatio(body: Buffer) {
  const open = /<svg\b[^>]*>/i.exec(body.toString("utf8", 0, 4000))?.[0] ?? "";
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(open);
  if (vb && Number(vb[2]) > 0) return Number(vb[1]) / Number(vb[2]);
  const w = /\swidth\s*=\s*["']?([\d.]+)/i.exec(open);
  const h = /\sheight\s*=\s*["']?([\d.]+)/i.exec(open);
  return w && h && Number(h[1]) > 0 ? Number(w[1]) / Number(h[1]) : 1;
}

function describe(c: Candidate) {
  if (c.kind === "svg") return "(inline svg)";
  return c.url.startsWith("data:") ? "(data: url)" : c.url.slice(0, 120);
}

async function fetchHomepage(domain: string): Promise<Fetched | null> {
  for (const url of [`https://${domain}/`, `https://www.${domain}/`, `http://${domain}/`]) {
    try {
      const page = await fetchHtml(url);
      if (page.contentType.includes("html") || /<html|<head/i.test(page.body.toString("utf8", 0, 2000))) return page;
    } catch {
      // Next form of the address.
    }
  }
  return null;
}

/**
 * Source 1, against HTML already in hand. Split out from the fetch so a test can run it
 * on a fixture; `fetchJsonFn` is only used for the manifest.
 */
export async function logoFromHomepageHtml(
  html: string,
  pageUrl: string,
  log: Log,
  fetchManifest: (url: string) => Promise<unknown> = (url) => fetchJson(url),
): Promise<{ png: Buffer; tier: string; wide?: boolean } | null> {
  const found = findHomepageCandidates(html, pageUrl);
  // A header wordmark that is too wide to read as an avatar is held back while the
  // squarer tiers below are tried, and only used if none of them works.
  let wideHeader: Buffer | null = null;
  for (const c of found.header) {
    const got = await tryCandidate(c, log);
    if (!got) continue;
    if (got.ratio <= WIDE_RATIO && got.ratio >= 1 / WIDE_RATIO) return { png: got.png, tier: "header" };
    wideHeader ??= got.png;
  }
  for (const c of found.appleTouch) {
    const got = await tryCandidate(c, log);
    if (got) return { png: got.png, tier: "apple-touch-icon" };
  }
  if (found.manifestUrl) {
    try {
      for (const c of manifestIcons(await fetchManifest(found.manifestUrl), found.manifestUrl)) {
        const got = await tryCandidate(c, log);
        if (got) return { png: got.png, tier: "manifest" };
      }
    } catch (err) {
      log(`  skip manifest: ${(err as Error).message.slice(0, 120)}`);
    }
  }
  if (found.ogImage) {
    const declared = found.ogImage.kind === "url" && found.ogImage.width && found.ogImage.height
      ? found.ogImage.width / found.ogImage.height
      : null;
    // Skip the download when the page already says it is a wide share card.
    if (declared === null || (declared >= 0.8 && declared <= 1.25)) {
      const got = await tryCandidate(found.ogImage, log, { requireSquare: true });
      if (got) return { png: got.png, tier: "og:image" };
    } else {
      log(`  skip og:image: declared ${found.ogImage.kind === "url" ? `${found.ogImage.width}×${found.ogImage.height}` : ""}, not square`);
    }
  }
  for (const c of found.favicons) {
    const got = await tryCandidate(c, log);
    if (got) return { png: got.png, tier: "favicon" };
  }
  return wideHeader ? { png: wideHeader, tier: "header (wide wordmark)", wide: true } : null;
}

export async function logoFromDomain(domain: string, log: Log): Promise<FoundLogo | null> {
  const page = await fetchHomepage(domain);
  if (!page) {
    log(`  ${domain}: homepage unreachable`);
    return null;
  }
  const hit = await logoFromHomepageHtml(page.body.toString("utf8"), page.url, log);
  if (!hit) return null;
  log(`  ${domain}: found via ${hit.tier}`);
  return { png: hit.png, source: `domain:${domain}`, wide: hit.wide };
}

// Same version src/lib/instagram.ts uses for the weekly sync — keep the two together.
const GRAPH_API_VERSION = "v21.0";

/**
 * Source 2. Business Discovery reads another account's public profile through an
 * account we already hold a token for — the client's own linked Instagram when there is
 * one, otherwise any linked account. Only business and creator accounts are visible to
 * it. instagram.com itself is never fetched.
 */
export async function logoFromInstagram(clientId: string, handle: string, log: Log): Promise<FoundLogo | null> {
  const username = handle.replace(/^@/, "").trim();
  if (!username) return null;
  const now = new Date();
  const accounts = await db.socialAccount.findMany({
    where: {
      platform: "INSTAGRAM",
      accessToken: { not: null },
      OR: [{ tokenExpiresAt: null }, { tokenExpiresAt: { gt: now } }],
    },
    select: { clientId: true, externalId: true, accessToken: true },
  });
  if (accounts.length === 0) {
    log(`  instagram @${username}: no connected Instagram account to ask through`);
    return null;
  }
  accounts.sort((a, b) => Number(b.clientId === clientId) - Number(a.clientId === clientId));
  const via = accounts[0];
  try {
    const url =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(via.externalId)}` +
      `?fields=${encodeURIComponent(`business_discovery.username(${username}){profile_picture_url}`)}` +
      `&access_token=${encodeURIComponent(via.accessToken!)}`;
    const json = await fetchJson<{ business_discovery?: { profile_picture_url?: string } }>(url);
    const pic = json.business_discovery?.profile_picture_url;
    if (!pic) {
      log(`  instagram @${username}: no profile picture (not a business/creator account?)`);
      return null;
    }
    const got = await tryCandidate({ kind: "url", url: pic, tier: "header" }, log);
    return got ? { png: got.png, source: `instagram:@${username}` } : null;
  } catch (err) {
    log(`  instagram @${username}: ${(err as Error).message.slice(0, 120)}`);
    return null;
  }
}

/** The studio's YouTube API key, or a token from any channel connected for publishing. */
async function youtubeAuth(): Promise<{ query: string; headers: Record<string, string> } | null> {
  const config = await db.socialConfig.findUnique({ where: { id: 1 } });
  if (config?.youtubeApiKey) return { query: `&key=${encodeURIComponent(config.youtubeApiKey)}`, headers: {} };
  if (!youtubeOAuthConfigured()) return null;
  const account = await db.socialAccount.findFirst({
    where: { platform: "YOUTUBE", refreshToken: { not: null } },
    select: { refreshToken: true },
  });
  if (!account?.refreshToken) return null;
  const { accessToken } = await refreshAccessToken(account.refreshToken);
  return { query: "", headers: { Authorization: `Bearer ${accessToken}` } };
}

/** Source 3: the channel thumbnail (up to 800px) from the YouTube Data API. */
export async function logoFromYouTube(
  ref: { handle?: string | null; channelId?: string | null },
  log: Log,
): Promise<FoundLogo | null> {
  const handle = ref.handle ? "@" + ref.handle.replace(/^@/, "").trim() : null;
  const label = handle ?? ref.channelId;
  if (!label) return null;
  try {
    const auth = await youtubeAuth();
    if (!auth) {
      log(`  youtube ${label}: no YouTube API key or connected channel`);
      return null;
    }
    const by = handle ? `forHandle=${encodeURIComponent(handle)}` : `id=${encodeURIComponent(ref.channelId!)}`;
    const json = await fetchJson<{
      items?: { snippet?: { thumbnails?: Record<string, { url?: string }> } }[];
    }>(`https://www.googleapis.com/youtube/v3/channels?part=snippet&${by}${auth.query}`, auth.headers);
    const thumbs = json.items?.[0]?.snippet?.thumbnails;
    const url = thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url;
    if (!url) {
      log(`  youtube ${label}: channel not found`);
      return null;
    }
    const got = await tryCandidate({ kind: "url", url, tier: "header" }, log);
    return got ? { png: got.png, source: `youtube:${label}` } : null;
  } catch (err) {
    log(`  youtube ${label}: ${(err as Error).message.slice(0, 120)}`);
    return null;
  }
}

type BrandfetchBrand = {
  logos?: { type?: string; theme?: string; formats?: { src?: string; format?: string; width?: number; height?: number }[] }[];
};

/** Source 4, only with BRANDFETCH_KEY set. Prefers the square icon over the wordmark, and raster over SVG. */
export async function logoFromBrandfetch(domain: string, log: Log): Promise<FoundLogo | null> {
  const key = process.env.BRANDFETCH_KEY;
  if (!key) return null;
  try {
    const r = await safeFetch(`https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`, {
      maxBytes: MAX_HTML_BYTES,
      accept: "application/json",
      headers: { Authorization: `Bearer ${key}` },
    });
    const brand = JSON.parse(r.body.toString("utf8")) as BrandfetchBrand;
    const rank = (t?: string) => ({ icon: 0, symbol: 1, logo: 2 })[t ?? ""] ?? 3;
    const fmtRank = (f?: string) => ({ png: 0, jpeg: 1, webp: 2, svg: 3 })[f ?? ""] ?? 4;
    const candidates = (brand.logos ?? [])
      .sort((a, b) => rank(a.type) - rank(b.type))
      .flatMap((l) => (l.formats ?? []).slice().sort((a, b) => fmtRank(a.format) - fmtRank(b.format)))
      .filter((f) => f.src);
    for (const f of candidates) {
      const got = await tryCandidate({ kind: "url", url: f.src!, tier: "header" }, log);
      if (got) return { png: got.png, source: "brandfetch" };
    }
    log(`  brandfetch ${domain}: nothing usable`);
    return null;
  } catch (err) {
    log(`  brandfetch ${domain}: ${(err as Error).message.slice(0, 120)}`);
    return null;
  }
}
