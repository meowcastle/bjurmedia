import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ttlFromNow } from "@/lib/submissionRequests";

/**
 * Close or reopen a send link.
 *
 * Reopening extends the expiry from now rather than restoring the old date: a link being
 * reopened a month later is being reopened because someone still needs to send, and
 * handing them the two days that were left over would just mean doing this again.
 *
 * Closing never deletes. The files that arrived through it stay where they are, and the
 * row is how the project remembers what was asked for and what came back.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.submissionRequest.findUnique({
    where: { id },
    include: { client: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { open } = await req.json();
  if (typeof open !== "boolean") {
    return NextResponse.json({ error: "open must be true or false." }, { status: 400 });
  }

  const request = await db.submissionRequest.update({
    where: { id },
    data: open ? { closedAt: null, expiresAt: ttlFromNow() } : { closedAt: new Date() },
  });

  await db.activity.create({
    data: {
      actor: "You",
      action: `${open ? "reopened" : "closed"} the send link for "${request.name}" on ${existing.client.name}`,
    },
  });

  return NextResponse.json({ request });
}
