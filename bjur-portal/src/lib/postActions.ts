import { db } from "@/lib/db";
import { postSlackEvent } from "@/lib/slack";

/**
 * Approve and Hold, shared by the two ways they can be reached: a signed-in owner in the
 * portal, and a signed link in the approval email. One implementation, so the emailed
 * route cannot drift into skipping a guard the in-app one enforces.
 */

export type PostActionResult =
  | { ok: true; state: "APPROVED" | "DRAFT" }
  | { ok: false; status: number; error: string };

type Actor = { kind: "user"; userId: string } | { kind: "email" };

export async function applyPostAction(
  assetId: string,
  action: "approve" | "hold",
  actor: Actor
): Promise<PostActionResult> {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      name: true,
      internal: true,
      publishState: true,
      project: { select: { clientId: true, client: { select: { name: true } } } },
    },
  });
  if (!asset || asset.internal) return { ok: false, status: 404, error: "Not found" };

  // Only a post actually waiting on the client can be approved or held. Anything already
  // PUBLISHING or PUBLISHED would mean overwriting state the worker owns.
  if (asset.publishState !== "AWAITING") {
    return { ok: false, status: 409, error: "This post isn't waiting for approval." };
  }

  const clientName = asset.project.client.name;
  // An emailed link proves possession of the token, not which person clicked it, so it
  // is not recorded as an approval by a named user.
  const via = actor.kind === "email" ? " by email" : "";

  if (action === "approve") {
    await db.asset.update({
      where: { id: assetId },
      data: {
        publishState: "APPROVED",
        approvedById: actor.kind === "user" ? actor.userId : null,
        approvedAt: new Date(),
        heldAt: null,
      },
    });
    await db.activity.create({
      data: { actor: clientName, action: `approved "${asset.name}" for publishing${via}` },
    });
    await postSlackEvent({
      clientId: asset.project.clientId,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `:white_check_mark: *${clientName}* approved *${asset.name}* for publishing${via}` },
        },
      ],
    }).catch(() => {});
    return { ok: true, state: "APPROVED" };
  }

  // Hold stops the clock rather than cancelling: the post stays scheduled and staff
  // decide what happens next. The auto-approve sweep skips DRAFT and checks heldAt.
  await db.asset.update({
    where: { id: assetId },
    data: { publishState: "DRAFT", heldAt: new Date(), approvalDueAt: null },
  });
  await db.activity.create({
    data: { actor: clientName, action: `held "${asset.name}" — needs a change before publishing${via}` },
  });
  await postSlackEvent({
    clientId: asset.project.clientId,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `:raised_hand: *${clientName}* put *${asset.name}* on hold — it will not auto-publish${via}` },
      },
    ],
  }).catch(() => {});
  return { ok: true, state: "DRAFT" };
}
