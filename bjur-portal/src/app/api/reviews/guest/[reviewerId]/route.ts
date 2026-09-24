import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { REVIEW_TOKEN_HEADER } from "@/lib/reviewToken";

/**
 * A guest naming themselves, once.
 *
 * Authorised by the token alone, matched against this reviewer — holding the link is the
 * whole of a guest's identity, so the token has to be the thing that proves it. Refuses
 * once a name is set: the link may be forwarded, and the second person to open it must
 * not be able to rewrite the first person's notes into their own name.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reviewerId: string }> }
) {
  const { reviewerId } = await params;
  const token = req.headers.get(REVIEW_TOKEN_HEADER)?.trim();
  if (!token) return new Response(null, { status: 403 });

  const reviewer = await db.reviewer.findUnique({ where: { id: reviewerId } });
  if (!reviewer || reviewer.revokedAt || reviewer.token !== token) {
    return new Response(null, { status: 404 });
  }
  if (reviewer.name.trim()) {
    return NextResponse.json({ error: "Already named." }, { status: 409 });
  }

  const { name } = await req.json().catch(() => ({}));
  const trimmed = typeof name === "string" ? name.trim().slice(0, 80) : "";
  if (!trimmed) return NextResponse.json({ error: "A name is needed." }, { status: 400 });

  await db.reviewer.update({ where: { id: reviewerId }, data: { name: trimmed } });
  return NextResponse.json({ ok: true });
}
