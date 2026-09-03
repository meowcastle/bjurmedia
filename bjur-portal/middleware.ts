import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "bjur_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Typing a bare "portal.justinbjur.com" makes the browser try http:// first. On the
  // NAS, port 80 has no vhost for this host, so nginx falls through to its default
  // site — a static page that meta-refreshes to https://media.moon.group, i.e. a
  // *different* machine's login screen. Clients hitting the portal for the first time
  // on a phone landed on someone else's NAS. HSTS fixes every subsequent visit, but
  // only after one successful HTTPS load, so the first one has to be corrected here.
  //
  // TLS terminates at the reverse proxy, so req.nextUrl.protocol is always "http:"
  // inside middleware; x-forwarded-proto is the only truthful signal of how the client
  // actually connected.
  //
  // /.well-known is deliberately exempt: Let's Encrypt validates over plain HTTP on
  // port 80, and redirecting the challenge would break renewal silently — the failure
  // would surface as an expired cert months later, not as an error now.
  if (
    req.headers.get("x-forwarded-proto") === "http" &&
    !pathname.startsWith("/.well-known/")
  ) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  const hasSession = req.cookies.has(SESSION_COOKIE);

  const isAdminRoute = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isClientRoute =
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/api");

  if (!hasSession && isAdminRoute) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  if (!hasSession && isClientRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // /api is excluded here, not just handled as a no-op in the logic above: Next.js
  // "proxy"-buffers (clones + caps at 10MB by default) the body of any request that
  // matches this config, whether or not the middleware function itself reads it. The
  // admin upload route's large file bodies were silently getting truncated at that
  // buffer cap before ever reaching the route handler. Every /api route already does
  // its own getSessionUser() check, so middleware was never actually gating them.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
