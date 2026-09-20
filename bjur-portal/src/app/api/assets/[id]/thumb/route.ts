import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { authorizeAssetAccess } from "@/lib/authz";
import { resolveDerivedPath, streamFile } from "@/lib/media";
import { db } from "@/lib/db";
import { verifyThumbSignature } from "@/lib/publishToken";

/**
 * Clean posters are immutable and cached for a year. A marked one must not be: the whole
 * point of the hold is that lifting it is instant, and a poster pinned in the client's
 * browser cache for a year would outlive the payment by a long way.
 */
function stream(thumbRelPath: string | null, marked = false) {
  if (!thumbRelPath) return new Response(null, { status: 404 });
  const cacheControl = marked ? "private, no-store" : "private, max-age=31536000, immutable";
  return resolveDerivedPath(thumbRelPath)
    .then((filePath) => streamFile(filePath, null, { cacheControl }))
    .catch(() => new Response(null, { status: 404 }));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // A valid signature stands in for a session. Mail clients fetch images with no
  // cookies, so an emailed thumbnail would 401 for every recipient otherwise. The
  // signature names this one asset and expires after a week, so it is not a way to
  // browse someone else's delivery.
  if (verifyThumbSignature(id, req.nextUrl.searchParams.get("sig"))) {
    const asset = await db.asset.findUnique({ where: { id }, select: { thumbRelPath: true } });
    return stream(asset?.thumbRelPath ?? null);
  }

  const auth = await authorizeAssetAccess("thumb", id, await getSessionUser());
  if (!auth.ok) return new Response(null, { status: auth.status });
  // A clean 960px poster is a usable still, so the hold covers it too.
  return auth.watermark
    ? stream(auth.asset.markedThumbRelPath, true)
    : stream(auth.asset.thumbRelPath);
}
