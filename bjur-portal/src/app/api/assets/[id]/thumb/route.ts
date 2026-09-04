import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { authorizeAssetAccess } from "@/lib/authz";
import { resolveDerivedPath, streamFile } from "@/lib/media";
import { db } from "@/lib/db";
import { verifyThumbSignature } from "@/lib/publishToken";

function stream(thumbRelPath: string | null) {
  if (!thumbRelPath) return new Response(null, { status: 404 });
  return resolveDerivedPath(thumbRelPath)
    .then((filePath) => streamFile(filePath, null, { cacheControl: "private, max-age=31536000, immutable" }))
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
  return stream(auth.asset.thumbRelPath);
}
