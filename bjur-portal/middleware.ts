import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "bjur_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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
