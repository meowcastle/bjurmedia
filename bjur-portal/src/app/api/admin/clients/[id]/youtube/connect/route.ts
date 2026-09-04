import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { youtubeConsentUrl, youtubeOAuthConfigured } from "@/lib/youtubeAuth";

/**
 * Starts the consent flow for one client's channel.
 *
 * The state parameter is bound to an httpOnly cookie rather than signed: this codebase
 * has no application secret to sign with (sessions use random tokens hashed in the
 * database), and inventing one here would be a second, weaker auth mechanism. The cookie
 * carries the client id too, so the callback cannot be pointed at a different client by
 * editing the URL.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!youtubeOAuthConfigured()) {
    return NextResponse.json(
      { error: "YouTube publishing isn't configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET." },
      { status: 501 }
    );
  }

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(youtubeConsentUrl(state));
  res.cookies.set("yt_oauth", `${state}:${id}`, {
    httpOnly: true,
    sameSite: "lax", // must survive the redirect back from Google
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return res;
}
