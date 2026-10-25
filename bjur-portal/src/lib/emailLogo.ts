/**
 * A client's logo as emails need it: absolute, on portal.bjur.nyc. logoUrl is stored as
 * a path (/api/logos/:id?v=…), which an inbox can't resolve. The route serves without a
 * session, so mail clients can load it.
 */
export function emailLogoUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) return null;
  if (/^https?:\/\//.test(logoUrl)) return logoUrl;
  const base = (process.env.PORTAL_URL ?? "https://portal.bjur.nyc").replace(/\/$/, "");
  return `${base}${logoUrl}`;
}
