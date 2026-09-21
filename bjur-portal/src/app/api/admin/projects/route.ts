import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createProject } from "@/lib/projects";
import { newRequestToken, slugify, ttlFromNow } from "@/lib/submissionRequests";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, title, expiresAt, type, review, startRequest, paymentHold } = await req.json();
  if (typeof clientId !== "string" || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Client and title are required." }, { status: 400 });
  }

  const projectType = type === "CALENDAR" ? "CALENDAR" : "DELIVERY";
  const wantsReview = review === true;

  // Calendar posts are approved in Slack, by reaction. A review loop on top of that would
  // ask the same person for the same yes in two places, so the create sheet disables it
  // and this refuses it — the shape is fixed at creation, so there is no later screen
  // where someone could talk themselves into the combination.
  if (projectType === "CALENDAR" && wantsReview) {
    return NextResponse.json({ error: "Calendar posts are approved in Slack" }, { status: 400 });
  }

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  // A calendar with nowhere to post is a board that fills up and never empties.
  if (projectType === "CALENDAR") {
    const channel = await db.clientChannel.findUnique({ where: { clientId } });
    if (!channel) {
      return NextResponse.json(
        { error: `Add a Slack channel for ${client.name} under Integrations first` },
        { status: 400 }
      );
    }
  }

  const { project, inboxPath } = await createProject({
    clientId,
    title: title.trim(),
    type: projectType,
    review: wantsReview,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  if (paymentHold === true) {
    await db.project.update({ where: { id: project.id }, data: { paymentHold: true } });
  }

  // "Start with a footage request" — the common case is a project that exists because
  // someone is about to send you something, so the link is ready before you close the sheet.
  let sendPath: string | null = null;
  if (typeof startRequest === "string" && startRequest.trim()) {
    const name = startRequest.trim();
    const token = newRequestToken();
    await db.submissionRequest.create({
      data: { projectId: project.id, name, token, expiresAt: ttlFromNow() },
    });
    sendPath = `/send/${slugify(project.title)}/${slugify(name)}-${token}`;
  }

  await db.activity.create({
    data: { actor: "You", action: `created project "${project.title}" for ${client.name}` },
  });

  return NextResponse.json({ project, inboxPath, sendPath });
}
