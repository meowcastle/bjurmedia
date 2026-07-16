import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { statSync } from "fs";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEDIA_ROOT, resolveArchivePath } from "@/lib/media";
import { postSlackEvent } from "@/lib/slack";

type Item = {
  path: string;
  name: string;
  kind: "PHOTO" | "VIDEO";
  format: "Reel" | "Film" | "Still" | "Master";
  orientation: "landscape" | "portrait";
  dims?: string | null;
  durationSec?: number | null;
};

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, items } = (await req.json()) as { projectId: string; items: Item[] };
  if (typeof projectId !== "string" || !Array.isArray(items) || !items.length) {
    return NextResponse.json({ error: "Project and at least one file are required." }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id: projectId }, include: { client: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let registered = 0;
  for (const item of items) {
    const abs = await resolveArchivePath(item.path).catch(() => null);
    if (!abs) continue;

    const relPath = path.relative(MEDIA_ROOT, abs);
    if (relPath.startsWith("..")) {
      return NextResponse.json(
        { error: "ARCHIVE_ROOT must live inside MEDIA_ROOT for registration to work — check server config." },
        { status: 500 }
      );
    }

    const existing = await db.asset.findFirst({ where: { relPath } });
    if (existing) continue;

    await db.asset.create({
      data: {
        projectId,
        kind: item.kind,
        format: item.format,
        orientation: item.orientation,
        name: item.name,
        relPath,
        sizeBytes: BigInt(statSync(abs).size),
        dims: item.dims ?? null,
        durationSec: item.durationSec ?? null,
        proxyStatus: "PENDING",
      },
    });
    registered++;
  }

  if (registered > 0 && project.status === "DRAFT") {
    await db.project.update({
      where: { id: projectId },
      data: { status: "LIVE", deliveredAt: new Date() },
    });
  }

  if (registered > 0) {
    await db.activity.create({
      data: { actor: "You", action: `imported ${registered} file(s) from the library into ${project.title}` },
    });
    await postSlackEvent({
      clientId: project.clientId,
      toggle: "autoUpload",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:package: *New delivery — ${project.client.name}*\n*${project.title}*\n${registered} file(s) imported from the library`,
          },
        },
      ],
    });
  }

  return NextResponse.json({ registered });
}
