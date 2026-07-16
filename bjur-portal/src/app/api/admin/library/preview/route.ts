import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { statSync } from "fs";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveArchivePath } from "@/lib/media";
import { classifyMedia } from "@/lib/ingest";
import { formatBytes } from "@/lib/format";

function guessYear(name: string) {
  const m = name.match(/20\d{2}/);
  return m ? m[0] : null;
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paths, projectId, autoMap } = await req.json();
  if (!Array.isArray(paths) || !paths.length || typeof projectId !== "string") {
    return NextResponse.json({ error: "Select files and a target project first." }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const fallbackYear = project.deliveredAt ? String(project.deliveredAt.getFullYear()) : String(new Date().getFullYear());

  const rows = [];
  for (const relPath of paths as string[]) {
    const abs = await resolveArchivePath(relPath).catch(() => null);
    if (!abs) continue;

    let classification;
    try {
      classification = await classifyMedia(abs);
    } catch {
      continue;
    }

    rows.push({
      path: relPath,
      name: path.basename(relPath),
      size: formatBytes(statSync(abs).size),
      kind: classification.kind,
      format: classification.format,
      orientation: classification.orientation,
      dims: classification.dims,
      durationSec: classification.durationSec,
      dateGuess: autoMap ? guessYear(path.basename(relPath)) ?? fallbackYear : fallbackYear,
    });
  }

  return NextResponse.json({ rows });
}
