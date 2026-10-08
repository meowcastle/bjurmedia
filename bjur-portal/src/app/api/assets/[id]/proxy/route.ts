import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { authorizeAssetAccess } from "@/lib/authz";
import { resolveDerivedPath, streamFile } from "@/lib/media";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  const auth = await authorizeAssetAccess("proxy", id, session);
  if (!auth.ok) return new Response(null, { status: auth.status });

  // On a payment hold the marked proxy is the only one this viewer may see. If it is not
  // encoded yet we serve nothing rather than falling back to the clean proxy — a gallery
  // that plays unmarked while the mark "catches up" is the whole feature leaking.
  const relPath = auth.watermark ? auth.asset.markedProxyRelPath : auth.asset.proxyRelPath;
  if (!relPath) return new Response(null, { status: 404 });

  const filePath = await resolveDerivedPath(relPath).catch(() => null);
  if (!filePath) return new Response(null, { status: 404 });

  try {
    // ?download=1 hands the preview over as a file instead of a stream: the phone-sized
    // copy of a reel, named after the master, for a client who wants it in their camera
    // roll rather than a 500 MB ProRes in their Downloads folder.
    const asFile = req.nextUrl.searchParams.get("download") === "1";
    const stem = auth.asset.name.replace(/\.[^.]+$/, "");
    return streamFile(filePath, req.headers.get("range"), {
      download: asFile ? `${stem}.mp4` : undefined,
      // Marked proxies are never cached — releasing the hold has to take effect on the
      // client's next play, not a day later.
      cacheControl: auth.watermark ? "private, no-store" : "private, max-age=86400",
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
