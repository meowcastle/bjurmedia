import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { authorizeAssetAccess } from "@/lib/authz";
import { resolveDerivedPath, streamFile } from "@/lib/media";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  const auth = await authorizeAssetAccess("thumb", id, session);
  if (!auth.ok) return new Response(null, { status: auth.status });

  if (!auth.asset.thumbRelPath) return new Response(null, { status: 404 });

  const filePath = await resolveDerivedPath(auth.asset.thumbRelPath).catch(() => null);
  if (!filePath) return new Response(null, { status: 404 });

  try {
    return streamFile(filePath, null, {
      cacheControl: `private, max-age=31536000, immutable`,
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
