import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { DERIVED_ROOT } from "@/lib/media";
import { LOGO_ASH, logoColorOf, measureImage, MIN_LOGO_PX, normalizeLogo, sniffImage } from "./image";
import { MAX_IMAGE_BYTES } from "./fetch";
import {
  brandDomainFor,
  cleanDomain,
  logoFromBrandfetch,
  logoFromDomain,
  logoFromInstagram,
  logoFromYouTube,
  type FoundLogo,
} from "./sources";

/**
 * Client logos and colours (v13 handoff §4).
 *
 * The worker's [logos] job runs on create, on edit and monthly: it walks the sources in
 * order (website → Instagram → YouTube → Brandfetch), saves the first good image as a
 * 256px PNG on the media volume, and picks the logo's colour. Nothing found leaves the
 * current logo alone (initials on the colour when there never was one).
 *
 * The functions under "For the admin UI" are what the client page calls — directly from
 * a server component/action, or through /api/admin/clients/[id]/logo.
 */

export { LOGO_ASH } from "./image";

/**
 * Under _derived because both containers can write there: web for a hand upload, the
 * worker for the job. The main media mount is read-only in web by design.
 */
export const LOGO_DIR = path.join(DERIVED_ROOT, "_logos");
const RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function logoFilePath(clientId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(clientId)) throw new Error("bad client id");
  return path.join(LOGO_DIR, `${clientId}.png`);
}

/** The cache-busting URL the app renders. A new file means a new ?v, so browsers re-fetch it. */
export function logoUrlFor(clientId: string, savedAt: Date) {
  return `/api/logos/${clientId}?v=${savedAt.getTime()}`;
}

/** Written beside the target and renamed over it, so a reader never sees half a PNG. */
async function saveLogoFile(clientId: string, png: Buffer) {
  await mkdir(LOGO_DIR, { recursive: true });
  const target = logoFilePath(clientId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, png);
  await rename(tmp, target);
}

type Log = (msg: string) => void;

/** Walks the four sources in order and returns the first logo found. */
export async function resolveClientLogo(clientId: string, log: Log = () => {}): Promise<FoundLogo | null> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: {
      websiteDomain: true,
      instagramHandle: true,
      youtubeHandle: true,
      socialAccounts: { select: { platform: true, handle: true, externalId: true } },
    },
  });
  if (!client) return null;

  // Stop at the first good image — except a too-wide website wordmark, which waits
  // behind the other sources and is used only if none of them finds anything.
  let wide: FoundLogo | null = null;
  const take = (hit: FoundLogo | null) => {
    if (hit?.wide) {
      wide ??= hit;
      return null;
    }
    return hit;
  };

  const domain = await brandDomainFor(clientId, client.websiteDomain);
  if (domain) {
    const hit = take(await logoFromDomain(domain, log));
    if (hit) return hit;
  }

  // A linked account stands in for a handle nobody has typed yet.
  const ig = client.instagramHandle ?? client.socialAccounts.find((a) => a.platform === "INSTAGRAM")?.handle;
  if (ig) {
    const hit = take(await logoFromInstagram(clientId, ig, log));
    if (hit) return hit;
  }

  const ytAccount = client.socialAccounts.find((a) => a.platform === "YOUTUBE");
  if (client.youtubeHandle || ytAccount) {
    const hit = take(
      await logoFromYouTube(
        client.youtubeHandle ? { handle: client.youtubeHandle } : { channelId: ytAccount!.externalId },
        log,
      ),
    );
    if (hit) return hit;
  }

  if (domain) {
    const hit = take(await logoFromBrandfetch(domain, log));
    if (hit) return hit;
  }
  return wide;
}

/**
 * One client's check. Never overwrites a locked logo — not even one locked while this
 * check was running, which is why the save is a conditional updateMany. Never throws.
 */
export async function checkClientLogo(clientId: string, log: Log = () => {}) {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { name: true, logoLocked: true, logoUrl: true, logoColor: true, logoCheckRequestedAt: true },
  });
  if (!client) return { found: false };
  const requestedAt = client.logoCheckRequestedAt;
  const now = new Date();
  let found: FoundLogo | null = null;

  try {
    if (!client.logoLocked) {
      log(` ${client.name}: looking`);
      found = await resolveClientLogo(clientId, log);
      log(` ${client.name}: ${found ? `found (${found.source})` : "nothing found"}`);
      // A long wordmark is a last resort; it does not replace a logo the client already has.
      if (found?.wide && client.logoUrl) {
        log(` ${client.name}: keeping the current logo over a wide wordmark`);
        found = null;
      }
    }
    if (found) {
      const color = await logoColorOf(found.png).catch(() => LOGO_ASH);
      // Re-check the lock immediately before writing the file, then write the row only if
      // still unlocked. A hand upload landing in between keeps its file and its row.
      const fresh = await db.client.findUnique({ where: { id: clientId }, select: { logoLocked: true } });
      if (fresh && !fresh.logoLocked) {
        await saveLogoFile(clientId, found.png);
        await db.client.updateMany({
          where: { id: clientId, logoLocked: false },
          data: { logoUrl: logoUrlFor(clientId, now), logoSource: found.source, logoFetchedAt: now, logoColor: color },
        });
      }
    } else if (!client.logoUrl && !client.logoColor) {
      // Never had a logo: initials go on ash rather than on nothing.
      await db.client.update({ where: { id: clientId }, data: { logoColor: LOGO_ASH } });
    }
  } catch (err) {
    log(`  ${client.name}: ${(err as Error).message.slice(0, 200)}`);
  } finally {
    // Recorded whatever happened, so a client whose sources all fail waits a month rather
    // than being retried every tick. The request is cleared only if nobody asked again
    // while this ran — an edit made mid-check still gets its own check.
    await db.client.updateMany({ where: { id: clientId }, data: { logoCheckedAt: now } }).catch(() => {});
    await db.client
      .updateMany({ where: { id: clientId, logoCheckRequestedAt: requestedAt }, data: { logoCheckRequestedAt: null } })
      .catch(() => {});
  }
  return { found: !!found, source: found?.source ?? null };
}

/**
 * The worker's tick: anything asked for (create, edit, "Refresh logo"), then anything
 * never checked or last checked over 30 days ago. A few per tick — each can be several
 * homepage fetches, and nobody is waiting on a monthly refresh.
 */
export async function processLogoQueue(opts: { limit?: number; log?: Log } = {}) {
  const log = opts.log ?? (() => {});
  const stale = new Date(Date.now() - RECHECK_AFTER_MS);
  const requested = await db.client.findMany({
    where: { logoLocked: false, logoCheckRequestedAt: { not: null } },
    orderBy: { logoCheckRequestedAt: "asc" },
    take: opts.limit ?? 3,
    select: { id: true },
  });
  const due =
    requested.length >= (opts.limit ?? 3)
      ? []
      : await db.client.findMany({
          where: {
            logoLocked: false,
            status: "ACTIVE",
            logoCheckRequestedAt: null,
            OR: [{ logoCheckedAt: null }, { logoCheckedAt: { lt: stale } }],
          },
          orderBy: { logoCheckedAt: { sort: "asc", nulls: "first" } },
          take: (opts.limit ?? 3) - requested.length,
          select: { id: true },
        });

  let found = 0;
  let missed = 0;
  for (const { id } of [...requested, ...due]) {
    const r = await checkClientLogo(id, log);
    if (r.found) found++;
    else missed++;
  }
  return { found, missed };
}

// ── For the admin UI ─────────────────────────────────────────────────────────────

/**
 * Asks the worker to look again on its next tick. Call after anything that could change
 * the answer: a client created, a login added, a handle or website edited. Never throws —
 * a logo is not worth failing the edit that triggered it.
 */
export async function requestLogoCheck(clientId: string) {
  await db.client
    .updateMany({ where: { id: clientId, logoLocked: false }, data: { logoCheckRequestedAt: new Date() } })
    .catch((err) => console.error("[logos] could not queue a check:", err));
}

/** "Refresh logo": unlocks a hand-uploaded logo and lets the job find one again. */
export async function refreshClientLogo(clientId: string) {
  await db.client.update({
    where: { id: clientId },
    data: { logoLocked: false, logoCheckRequestedAt: new Date() },
  });
}

/**
 * "Replace logo": a hand upload. Saved like a found logo, and locked so the job never
 * overwrites it. Returns an error string for anything that is not a usable image.
 */
export async function replaceClientLogo(clientId: string, bytes: Buffer): Promise<{ ok: true; logoUrl: string; logoColor: string } | { ok: false; error: string }> {
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "That image is over 5 MB." };
  const kind = sniffImage(bytes);
  if (!kind || kind === "ico" || kind === "bmp") return { ok: false, error: "Upload a PNG, JPG, WebP, GIF or SVG." };
  const size = measureImage(bytes, kind);
  if (!size) return { ok: false, error: "Couldn't read that image." };
  if (Math.max(size.width, size.height) < MIN_LOGO_PX) {
    return { ok: false, error: `That image is ${size.width}×${size.height}; it needs to be at least ${MIN_LOGO_PX}px.` };
  }
  let png: Buffer;
  try {
    png = await normalizeLogo(bytes, kind, size);
  } catch {
    return { ok: false, error: kind === "svg" ? "Couldn't render that SVG. Try a PNG." : "Couldn't read that image." };
  }
  const logoColor = await logoColorOf(png).catch(() => LOGO_ASH);
  await saveLogoFile(clientId, png);
  const now = new Date();
  const logoUrl = logoUrlFor(clientId, now);
  await db.client.update({
    where: { id: clientId },
    data: { logoUrl, logoColor, logoSource: "upload", logoFetchedAt: now, logoLocked: true, logoCheckRequestedAt: null },
  });
  return { ok: true, logoUrl, logoColor };
}

/**
 * Sets where the job should look. Each field is optional: undefined leaves it, null or ""
 * clears it. Queues a check when anything actually changed.
 */
export async function setClientLogoSources(
  clientId: string,
  input: { websiteDomain?: string | null; instagramHandle?: string | null; youtubeHandle?: string | null },
) {
  const norm = {
    websiteDomain: (v: string) => cleanDomain(v),
    instagramHandle: (v: string) => v.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, ""),
    youtubeHandle: (v: string) => {
      const h = v.trim().replace(/^https?:\/\/(www\.)?youtube\.com\//i, "").replace(/\/.*$/, "");
      return h ? (h.startsWith("@") ? h : `@${h}`) : "";
    },
  } as const;
  const data: Record<string, string | null> = {};
  for (const key of Object.keys(norm) as (keyof typeof norm)[]) {
    const v = input[key];
    if (v === undefined) continue;
    data[key] = v === null ? null : norm[key](v) || null;
  }
  const before = await db.client.findUniqueOrThrow({
    where: { id: clientId },
    select: { websiteDomain: true, instagramHandle: true, youtubeHandle: true },
  });
  const changed = Object.entries(data).some(([k, v]) => before[k as keyof typeof before] !== v);
  const client = await db.client.update({
    where: { id: clientId },
    data: { ...data, ...(changed ? { logoCheckRequestedAt: new Date() } : {}) },
    select: { websiteDomain: true, instagramHandle: true, youtubeHandle: true },
  });
  return { client, queued: changed };
}

/** Seeds a logo from a local image without locking it — the job may refresh it later. */
export async function seedClientLogo(clientId: string, bytes: Buffer, source = "seed") {
  const kind = sniffImage(bytes);
  if (!kind) throw new Error("not an image");
  const png = await normalizeLogo(bytes, kind, measureImage(bytes, kind));
  const logoColor = await logoColorOf(png).catch(() => LOGO_ASH);
  await saveLogoFile(clientId, png);
  const now = new Date();
  const logoUrl = logoUrlFor(clientId, now);
  // logoCheckedAt now, so the monthly refresh comes round in 30 days rather than on the
  // worker's next tick replacing what was just seeded.
  await db.client.update({
    where: { id: clientId },
    data: { logoUrl, logoColor, logoSource: source, logoFetchedAt: now, logoCheckedAt: now, logoLocked: false },
  });
  return { logoUrl, logoColor };
}
