import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStage } from "@/lib/crm/stages";

/**
 * A new deal on the pipeline. A contact can be named inline — most leads arrive as a name
 * and an address, and asking for a contact record first would be ceremony. An address
 * that already belongs to a contact reuses it.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A deal needs a title." }, { status: 400 });
  const stage = isStage(body.stage) ? body.stage : "LEAD";
  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  const amount = typeof body.amount === "number" && Number.isFinite(body.amount) ? Math.round(body.amount) : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const name = typeof body.contactName === "string" ? body.contactName.trim() : "";
  const email = typeof body.contactEmail === "string" ? body.contactEmail.trim().toLowerCase() : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email address does not look right." }, { status: 400 });
  }
  let contactId: string | null = null;
  if (email || name) {
    const existing = email ? await db.contact.findUnique({ where: { email } }) : null;
    contactId =
      existing?.id ??
      (await db.contact.create({ data: { name: name || email, email: email || null, clientId, source: "manual" } })).id;
  }

  const deal = await db.deal.create({ data: { title, stage, clientId, contactId, amount, notes } });
  await db.activity.create({ data: { actor: "You", action: `added "${title}" to the pipeline` } });
  return NextResponse.json({ deal: { id: deal.id } });
}
