import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listArchiveDir, listArchiveFilesRecursive } from "@/lib/library";

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dir = req.nextUrl.searchParams.get("dir") ?? "";
  const recursive = req.nextUrl.searchParams.get("recursive") === "1";

  try {
    const entries = recursive ? await listArchiveFilesRecursive(dir) : await listArchiveDir(dir);
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: `Couldn't read that path: ${(err as Error).message}` }, { status: 400 });
  }
}
