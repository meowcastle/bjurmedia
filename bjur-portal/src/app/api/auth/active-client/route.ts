import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, setActiveClient } from "@/lib/auth";

/**
 * Switches which client the current session is viewing.
 *
 * Membership is re-checked server-side in setActiveClient rather than trusted from the
 * switcher's options: the list of clients a seat may see is exactly the list it may
 * switch to, and a hand-rolled POST must not be able to widen that.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = (await req.json()) as { clientId?: string };
  if (!clientId) return NextResponse.json({ error: "clientId is required." }, { status: 400 });

  const ok = await setActiveClient(session.sessionId, session.id, clientId);
  if (!ok) {
    // Deliberately the same answer as a client that does not exist — probing this
    // endpoint should not reveal which other clients the studio has.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, clientId });
}
