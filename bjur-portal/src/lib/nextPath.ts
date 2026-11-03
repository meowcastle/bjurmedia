/**
 * Where to go after sign in, from a ?next= that arrived in a URL (the cut-ready mail's
 * "Sign in and review" link). Same-origin paths only: it has to start with one slash, not
 * two, or "//evil.example" would send a freshly signed-in client to someone else's site.
 */
export function safeNext(raw: string | string[] | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
