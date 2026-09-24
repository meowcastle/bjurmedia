import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * The cut's notes as markers you can drop into an edit.
 *
 * The point of the review screen is that a note carries a time; the point of this is that
 * the time survives the trip back into Premiere or Resolve instead of being read off a
 * screen and typed in again.
 *
 * Sent notes only, as everywhere.
 */
function tc(sec: number, fps: number) {
  const t = Math.max(0, sec);
  const p = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return `${p(t / 3600)}:${p((t % 3600) / 60)}:${p(t % 60)}:${p((t % 1) * fps)}`;
}

/** Excel opens CSV by double-click and mangles anything with a comma in it. */
function csvCell(s: string) {
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return new Response(null, { status: 403 });

  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "csv";

  const cut = await db.review.findUnique({
    where: { id },
    include: { asset: { select: { name: true, contentTitle: true } } },
  });
  if (!cut) return new Response(null, { status: 404 });

  const notes = await db.reviewNote.findMany({
    where: { reviewId: id, sentAt: { not: null }, timeSec: { not: null } },
    orderBy: { timeSec: "asc" },
    include: { reviewer: { select: { name: true } } },
  });

  const fps = 23.976;
  const base = (cut.asset.contentTitle || cut.asset.name).replace(/\.[^.]+$/, "");
  const stem = `${base.replace(/[^a-z0-9]+/gi, "-")}-cut${cut.version}-markers`;

  let body: string;
  let type: string;
  let filename: string;

  if (format === "edl") {
    // Resolve reads a CMX3600 EDL's comment lines as markers. One event per note, all
    // zero-length: a note is a point in time, not a range.
    const events = notes
      .map((n, i) => {
        const t = tc(n.timeSec ?? 0, fps);
        return `${String(i + 1).padStart(3, "0")}  001      V     C        ${t} ${t} ${t} ${t}\n* ${
          n.reviewer.name
        }: ${n.body.replace(/\r?\n/g, " ")}`;
      })
      .join("\n\n");
    body = `TITLE: ${base} cut ${cut.version}\nFCM: NON-DROP FRAME\n\n${events}\n`;
    type = "application/octet-stream";
    filename = `${stem}.edl`;
  } else if (format === "txt") {
    body = notes
      .map((n) => `${tc(n.timeSec ?? 0, fps)}  ${n.reviewer.name}: ${n.body.replace(/\r?\n/g, " ")}`)
      .join("\n");
    type = "text/plain; charset=utf-8";
    filename = `${stem}.txt`;
  } else {
    // Premiere's marker import wants a header row and a timecode column.
    const rows = notes.map((n) =>
      [
        csvCell(`${n.reviewer.name}`),
        csvCell(n.body.replace(/\r?\n/g, " ")),
        csvCell(tc(n.timeSec ?? 0, fps)),
        csvCell(tc(n.timeSec ?? 0, fps)),
        csvCell(n.outcome ?? ""),
      ].join(",")
    );
    body = ["Marker Name,Description,In,Out,Status", ...rows].join("\n");
    type = "text/csv; charset=utf-8";
    filename = `${stem}.csv`;
  }

  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
