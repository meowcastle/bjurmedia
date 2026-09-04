import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed one-use-ish links for the approval email, so a client can act without logging
 * in. The token carries the asset, the action and an expiry, and is signed with
 * SESSION_SECRET — which compose has always provisioned and nothing read until now.
 *
 * Bound to the action as well as the asset: an Approve link cannot be edited into a Hold.
 */

export type PublishTokenPayload = {
  assetId: string;
  action: "approve" | "hold";
  /** Epoch ms. The email's links die when the post was due to go out. */
  exp: number;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  // Refusing to sign is the right failure. Falling back to a constant would mint tokens
  // that look signed and are forgeable by anyone who has read this file.
  if (!value) throw new Error("SESSION_SECRET is not set — cannot sign approval links.");
  return value;
}

export function canSignPublishTokens() {
  return Boolean(process.env.SESSION_SECRET);
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signPublishToken(payload: PublishTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyPublishToken(token: string | null | undefined): PublishTokenPayload | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }

  // Constant-time: a plain === leaks how much of a forged signature was right.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: PublishTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }

  if (payload.action !== "approve" && payload.action !== "hold") return null;
  if (typeof payload.assetId !== "string" || !payload.assetId) return null;
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;

  return payload;
}


/**
 * Signed thumbnail URLs for email.
 *
 * Mail clients fetch images with no cookies, so /api/assets/:id/thumb would 401 for
 * every recipient. A short-lived signature lets the image load without opening the
 * asset to anyone who guesses an id: it names one asset and dies in seven days.
 */
export function signThumbUrl(portalUrl: string, assetId: string, ttlMs = 7 * 86_400_000) {
  const exp = Date.now() + ttlMs;
  const body = Buffer.from(JSON.stringify({ assetId, exp })).toString("base64url");
  return `${portalUrl}/api/assets/${assetId}/thumb?sig=${body}.${sign(body)}`;
}

export function verifyThumbSignature(assetId: string, sig: string | null | undefined) {
  if (!sig) return false;
  const [body, mac] = sig.split(".");
  if (!body || !mac) return false;

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return false;
  }
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { assetId: string; exp: number };
    // Bound to the asset in the path: one signature cannot be moved to another file.
    return payload.assetId === assetId && Date.now() <= payload.exp;
  } catch {
    return false;
  }
}
