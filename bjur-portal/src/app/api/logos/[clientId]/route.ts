import { NextRequest } from "next/server";
import { existsSync } from "fs";
import { streamFile } from "@/lib/media";
import { logoFilePath } from "@/lib/logos";

/**
 * A client's logo, as saved by src/lib/logos. No session check, on purpose: it is the
 * client's own public brand mark, found on their public website or profile, and mail
 * clients fetch images with no cookies. The id is an unguessable cuid, so this is not a
 * way to list who the studio works with.
 *
 * The app always links it with ?v=<saved at>, so a versioned request is cached for good
 * and a new logo is simply a new URL.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  let filePath: string;
  try {
    filePath = logoFilePath(clientId);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (!existsSync(filePath)) return new Response(null, { status: 404 });
  const versioned = req.nextUrl.searchParams.has("v");
  return streamFile(filePath, null, {
    contentType: "image/png",
    cacheControl: versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
  });
}
