import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { previewProjectWeek, postProjectWeek } from "@/lib/postWeek";

/**
 * The board's POST TO SLACK button.
 *
 * GET previews — the exact lines and the channel they would land in. POST sends.
 * Splitting them is the point: this writes into the client's own workspace, which is
 * not somewhere to discover a mistake after the fact.
 */

/** A week is keyed by the Monday. Anything else would let two "weeks" overlap. */
function parseWeek(raw: string | null) {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  const weekStart = parseWeek(req.nextUrl.searchParams.get("weekStart"));
  if (!projectId || !weekStart) {
    return NextResponse.json({ error: "projectId and weekStart (YYYY-MM-DD) required" }, { status: 400 });
  }

  const preview = await previewProjectWeek(projectId, weekStart);
  if (!preview) {
    return NextResponse.json({ error: "This project isn't scheduled on the board." }, { status: 404 });
  }
  return NextResponse.json(preview);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const weekStart = parseWeek(typeof body.weekStart === "string" ? body.weekStart : null);
  if (!body.projectId || !weekStart) {
    return NextResponse.json({ error: "projectId and weekStart (YYYY-MM-DD) required" }, { status: 400 });
  }

  const result = await postProjectWeek(body.projectId, weekStart);
  if (!result.ok) {
    // 409 for "you have work to do first", 404 for the wrong project, 502 when Slack
    // itself refused — the caller shows different copy for each.
    const status =
      result.error === "not-a-calendar-project"
        ? 404
        : result.error === "slack-rejected"
          ? 502
          : 409;
    return NextResponse.json(
      { error: result.detail, code: result.error, unapproved: result.unapproved },
      { status }
    );
  }
  return NextResponse.json(result);
}
