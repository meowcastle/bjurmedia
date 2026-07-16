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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
