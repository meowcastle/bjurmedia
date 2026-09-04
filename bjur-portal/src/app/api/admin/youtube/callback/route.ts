import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { exchangeCodeForTokens, fetchOwnChannel } from "@/lib/youtubeAuth";

function back(req: NextRequest, clientId: string | null, message: string) {
  const base = req.nextUrl.origin;
  const url = clientId ? `${base}/admin/clients/${clientId}` : `${base}/admin/integrations`;
  return NextResponse.redirect(`${url}?yt=${encodeURIComponent(message)}`);
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookie = req.cookies.get("yt_oauth")?.value ?? "";
  const [expectedState, clientId] = cookie.split(":");
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  // Cleared on every exit path — a state left lying around is a state that can be reused.
  const clear = (res: NextResponse) => {
    res.cookies.set("yt_oauth", "", { path: "/", maxAge: 0 });
    return res;
  };

  if (error) return clear(back(req, clientId ?? null, `Google said: ${error}`));
  if (!expectedState || !clientId || !state || state !== expectedState) {
    return clear(back(req, null, "That connection link expired. Start again from the client's page."));
  }
  if (!code) return clear(back(req, clientId, "Google didn't return an authorization code."));

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Without it the connection works for an hour and then dies silently, which is
      // worse than refusing it now.
      throw new Error("Google didn't return a refresh token. Remove the app's access in your Google account and try again.");
    }
    const channel = await fetchOwnChannel(tokens.access_token);

    await db.socialAccount.upsert({
      where: { clientId_platform: { clientId, platform: "YOUTUBE" } },
      create: {
        clientId,
        platform: "YOUTUBE",
        externalId: channel.id,
        handle: channel.handle,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        lastSyncError: null,
      },
      update: {
        externalId: channel.id,
        handle: channel.handle,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        lastSyncError: null,
      },
    });

    return clear(back(req, clientId, `Connected ${channel.handle}`));
  } catch (err) {
    return clear(back(req, clientId, err instanceof Error ? err.message : "Connection failed."));
  }
}
