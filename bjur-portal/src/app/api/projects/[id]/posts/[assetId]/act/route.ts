import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPublishToken } from "@/lib/publishToken";
import { applyPostAction } from "@/lib/postActions";

/**
 * The target of the Approve / Hold buttons in the approval email.
 *
 * The handoff calls these "one-click signed links". They are two clicks here, and that
 * is deliberate: a bare GET that changes state gets fired by things that are not the
 * recipient — Outlook Safe Links, Gmail's proxy, corporate mail scanners all follow
 * links in mail to check them. A scanner silently approving a client's post, or silently
 * holding one so it misses its slot, is a failure nobody would ever be able to explain.
 *
 * So GET renders a confirmation page and POST performs the action. The click count goes
 * from one to two; the class of silent, unattributable state change goes away.
 */

const CARD = `font-family:Archivo,system-ui,sans-serif;background:#0a0a0b;color:#ededec`;

function page(body: string, status = 200) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Bjur Media</title></head>
     <body style="margin:0;${CARD};min-height:100vh;display:grid;place-items:center;padding:24px">
       <div style="max-width:460px;width:100%;background:#141416;border:1px solid #2a2a2e">
         <div style="height:3px;background:#ec3013"></div>
         <div style="padding:32px">${body}</div>
       </div>
     </body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function message(title: string, detail: string, status = 200) {
  return page(
    `<h1 style="margin:0 0 10px;font-size:22px;font-weight:800;letter-spacing:-.02em">${esc(title)}</h1>
     <p style="margin:0;font-size:14px;line-height:1.6;color:#a9a8a7">${esc(detail)}</p>`,
    status
  );
}

async function load(assetId: string, projectId: string) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      name: true,
      contentTitle: true,
      projectId: true,
      internal: true,
      publishState: true,
      publishAt: true,
      caption: true,
    },
  });
  // Scoped to the project in the URL as well as the token, so a token cannot be replayed
  // against a path belonging to someone else.
  if (!asset || asset.projectId !== projectId || asset.internal) return null;
  return asset;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const { id: projectId, assetId } = await params;
  const token = req.nextUrl.searchParams.get("t");
  const payload = verifyPublishToken(token);

  if (!payload || payload.assetId !== assetId) {
    return message(
      "This link has expired",
      "Approval links stop working once the post was due to go out. Sign in to the portal to see where it got to.",
      410
    );
  }

  const asset = await load(assetId, projectId);
  if (!asset) return message("Not found", "That post no longer exists.", 404);

  if (asset.publishState !== "AWAITING") {
    return message(
      "Nothing left to do",
      `This post is already marked ${asset.publishState.toLowerCase()}, so it isn't waiting on you any more.`
    );
  }

  const isApprove = payload.action === "approve";
  const other = isApprove ? "hold" : "approve";
  const title = asset.contentTitle || asset.name;

  return page(`
    <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#ec3013;font-weight:700;margin-bottom:14px">
      ${isApprove ? "Approve this post" : "Hold this post"}
    </div>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.02em">${esc(title)}</h1>
    <p style="margin:0 0 20px;font-size:13px;color:#7d7c7a">
      ${asset.publishAt ? esc(new Date(asset.publishAt).toUTCString()) : "No publish time set"}
    </p>
    ${
      asset.caption
        ? `<p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#a9a8a7;border-left:2px solid #2a2a2e;padding-left:12px">${esc(
            asset.caption.slice(0, 400)
          )}</p>`
        : ""
    }
    <form method="POST">
      <input type="hidden" name="t" value="${esc(token!)}">
      <button type="submit" style="width:100%;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;padding:13px;border:0;background:${
        isApprove ? "#ec3013" : "#2a2a2e"
      };color:${isApprove ? "#0a0a0b" : "#ededec"}">
        ${isApprove ? "Yes, approve it" : "Yes, hold it"}
      </button>
    </form>
    <p style="margin:16px 0 0;font-size:12px;color:#7d7c7a;text-align:center">
      Changed your mind? <a href="/p/${esc(projectId)}" style="color:#ff5233">Open the portal</a> to ${esc(other)} instead.
    </p>
  `);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const { id: projectId, assetId } = await params;

  // The token comes from the form body, not the query string: a POST target is not
  // something a link scanner follows, and it keeps the signed value out of referrers.
  const form = await req.formData();
  const payload = verifyPublishToken(String(form.get("t") ?? ""));

  if (!payload || payload.assetId !== assetId) {
    return message("This link has expired", "Sign in to the portal to act on this post.", 410);
  }
  if (!(await load(assetId, projectId))) return message("Not found", "That post no longer exists.", 404);

  const result = await applyPostAction(assetId, payload.action, { kind: "email" });
  if (!result.ok) return message("Nothing left to do", result.error, result.status);

  return payload.action === "approve"
    ? message("Approved", "Thanks — it'll go out at its scheduled time.")
    : message("On hold", "We've been told. Nothing will publish until the team has had a look.");
}
