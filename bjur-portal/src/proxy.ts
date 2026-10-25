import { NextRequest, NextResponse } from "next/server";

/**
 * The move from portal.justinbjur.com (v13 §6). The Cloudflare redirect adds ?from=jb to
 * every old link. Signed out, the layouts send a visitor to sign in and the query is
 * lost on the way, so this keeps the flag for the one page that tells them we moved.
 * Nothing else happens here: without ?from=jb every request passes straight through.
 *
 * (The root middleware.ts is not this file's ancestor: with the app under src/, Next only
 * runs a proxy/middleware that sits in src/.)
 */
export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
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
