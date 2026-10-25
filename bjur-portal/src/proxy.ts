import { NextRequest, NextResponse } from "next/server";

const OLD_HOST = "portal.justinbjur.com";
const NEW_ORIGIN = "https://portal.bjur.nyc";

/**
 * The move from portal.justinbjur.com (v13 §6), done here rather than in Cloudflare: both
 * hostnames reach this app, so a page request on the old one gets a 301 to the same path
 * on portal.bjur.nyc, query kept, with ?from=jb so sign in can say we moved. Emailed
 * project links, guest review links (/r/…) and send links (/send/…) all land on the same
 * page. The API is left alone: a 301 turns a POST into a GET, and a page already open on
 * the old host should finish what it is doing (an upload, a note) before it moves.
 *
 * On the new host the only job is keeping ?from=jb on the way to sign in. Signed out, the
 * layouts send a visitor to /login and the query is lost on the way.
 *
 * (Next only runs a proxy/middleware that sits in src/ when the app lives under src/.)
 */
export function proxy(req: NextRequest) {
  const { pathname, searchParams, search } = req.nextUrl;

  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (host === OLD_HOST) {
    const params = new URLSearchParams(search);
    params.set("from", "jb");
    return NextResponse.redirect(`${NEW_ORIGIN}${pathname}?${params}`, 301);
  }

  if (searchParams.get("from") !== "jb" || req.cookies.has("bjur_session")) return NextResponse.next();
  if (pathname === "/login" || pathname === "/admin/login") return NextResponse.next();
  // Guest review links and send-footage links work without a login; let them through.
  if (pathname.startsWith("/r/") || pathname.startsWith("/send/")) return NextResponse.next();
  const url = new URL(pathname.startsWith("/admin") ? "/admin/login" : "/login", req.url);
  url.searchParams.set("from", "jb");
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: never the API, built assets or the images emails load.
  matcher: ["/((?!_next/|api/|email/|favicon.ico).*)"],
};
