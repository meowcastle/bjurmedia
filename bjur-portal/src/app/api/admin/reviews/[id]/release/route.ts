import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sendCut } from "@/lib/cutRelease";

/** Send an unsent cut to its reviewers. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return new Response(null, { status: 403 });

  const { id } = await params;
  const result = await sendCut(id, "You");
  if (!result.ok) return NextResponse.json({ error: "That cut cannot be sent." }, { status: 409 });
  return NextResponse.json({ sent: result.sent });
}
