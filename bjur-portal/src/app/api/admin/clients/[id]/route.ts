import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidHexColor } from "@/lib/color";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if ("accentColor" in body) {
    const { accentColor } = body as { accentColor: string | null };
    if (accentColor !== null && !isValidHexColor(accentColor)) {
      return NextResponse.json({ error: "Invalid accent color." }, { status: 400 });
    }
    const client = await db.client.update({ where: { id }, data: { accentColor } });
    return NextResponse.json({ client });
  }

  if ("logoUrl" in body) {
    const { logoUrl } = body as { logoUrl: string | null };
    if (logoUrl !== null) {
      try {
        new URL(logoUrl);
      } catch {
        return NextResponse.json({ error: "Invalid logo URL." }, { status: 400 });
      }
    }
    const client = await db.client.update({ where: { id }, data: { logoUrl } });
    return NextResponse.json({ client });
  }

  // Its own branch, like accentColor and logoUrl above, because this route's fallthrough
  // treats an unrecognised body as a status change.
  if ("captionStyle" in body) {
    const { captionStyle } = body as { captionStyle: string | null };
    if (captionStyle !== null && typeof captionStyle !== "string") {
      return NextResponse.json({ error: "captionStyle must be text." }, { status: 400 });
    }
    // Long enough for real examples — a style guide with no examples in it is just
    // adjectives, and the model writes generic copy from adjectives.
    if (typeof captionStyle === "string" && captionStyle.length > 8000) {
      return NextResponse.json({ error: "Style guide is too long (8000 characters max)." }, { status: 400 });
    }
    const client = await db.client.update({
      where: { id },
      data: { captionStyle: captionStyle?.trim() || null },
    });
    return NextResponse.json({ client });
  }

  if ("autoCaption" in body) {
    const { autoCaption } = body as { autoCaption?: boolean };
    if (typeof autoCaption !== "boolean") {
      return NextResponse.json({ error: "autoCaption must be true or false." }, { status: 400 });
    }
    const client = await db.client.update({ where: { id }, data: { autoCaption } });
    return NextResponse.json({ client });
  }

  const { status } = body;
  if (status !== "ACTIVE" && status !== "DISABLED") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const client = await db.client.update({ where: { id }, data: { status } });

  if (status === "DISABLED") {
    await db.session.deleteMany({ where: { user: { clientId: id } } });
  }

  await db.activity.create({
    data: {
      actor: "You",
      action: `${status === "DISABLED" ? "disabled" : "re-enabled"} client "${client.name}"`,
    },
  });

  return NextResponse.json({ client });
}
