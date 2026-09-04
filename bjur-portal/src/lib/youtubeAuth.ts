/**
 * YouTube OAuth. Uploading is not something the studio-wide API key can do — that key
 * only reads public statistics (see youtube.ts). Putting a video on a client's channel
 * needs that channel's own consent, once, and a refresh token afterwards.
 *
 * Raw fetch rather than googleapis, matching youtube.ts and instagram.ts: the three
 * calls below are the whole surface, and the SDK is 20MB of transitive dependency for
 * them.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// youtube.upload to publish; youtube.readonly to resolve which channel consented, so
// the connection is recorded against the right one rather than whatever the admin typed.
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export function youtubeOAuthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function youtubeRedirectUri() {
  const base = process.env.PORTAL_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${base}/api/admin/youtube/callback`;
}

export function youtubeConsentUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent together are what actually guarantee a refresh_token. Without
    // prompt=consent Google returns one only on the very first authorisation ever, so a
    // re-connect after a revoke would silently come back with no way to refresh.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(`YouTube token exchange failed: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json;
}

export async function exchangeCodeForTokens(code: string) {
  return postToken({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirect_uri: youtubeRedirectUri(),
    grant_type: "authorization_code",
  });
}

/** Access tokens last an hour; the refresh token is the durable half we store. */
export async function refreshAccessToken(refreshToken: string) {
  const json = await postToken({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });
  return { accessToken: json.access_token, expiresAt: new Date(Date.now() + json.expires_in * 1000) };
}

/** The channel that just consented — not one an admin typed in and might get wrong. */
export async function fetchOwnChannel(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`YouTube channel lookup failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    items?: { id: string; snippet: { title: string; customUrl?: string } }[];
  };
  const channel = json.items?.[0];
  if (!channel) throw new Error("That Google account has no YouTube channel.");
  return { id: channel.id, handle: channel.snippet.customUrl ?? channel.snippet.title };
}
