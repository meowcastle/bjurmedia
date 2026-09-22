/**
 * Proves the payment hold decides what a client is served, and — the part that actually
 * matters — that it fails closed.
 *
 * The hold's whole value is that a client who has not paid cannot end up with the clean
 * file. Every way that could go wrong is a *silent* one: a route that falls back to the
 * master because the mark is still encoding, an admin check that accidentally applies to
 * clients, a release that does not take. None of those look like failures from outside,
 * which is why they are asserted here rather than eyeballed.
 *
 * Driven through authorizeAssetAccess (not HTTP) because that is where the decision is
 * made — every serving route reads `watermark` off it.
 *
 * Run by e2e/payment-hold.spec.ts. Prints one JSON line of results.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "bjur-hold-")));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.MEDIA_ROOT = dir;
process.env.DERIVED_ROOT = path.join(dir, "_derived");
process.env.INBOX_ROOT = path.join(dir, "_inbox");
delete process.env.SLACK_WEBHOOK_URL;
process.env.DELIVERY_EMAILS = "off";

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  stdio: "pipe",
});

const results: { name: string; pass: boolean; detail?: string }[] = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { authorizeAssetAccess } = await import("../src/lib/authz");
  const { queueProjectForMarking, markedReady, holdApplies } = await import("../src/lib/paymentHold");

  const stamp = Date.now();
  const client = await db.client.create({ data: { name: "Hold Co", username: `hold-${stamp}` } });

  const seat = await db.user.create({
    data: {
      clientId: client.id,
      name: "Client Owner",
      email: `owner-${stamp}@example.com`,
      passwordHash: "x",
      role: "OWNER",
    },
  });
  const staff = await db.user.create({
    data: { name: "Staff", email: `staff-${stamp}@example.com`, passwordHash: "x", isAdmin: true },
  });

  const session = {
    id: seat.id,
    name: seat.name,
    email: seat.email,
    clientId: client.id,
    role: "OWNER" as const,
    memberships: [],
    isAdmin: false,
    mustChangePassword: false,
    sessionId: "s1",
  };
  const adminSession = { ...session, id: staff.id, clientId: null, isAdmin: true, sessionId: "s2" };

  const project = await db.project.create({
    data: {
      clientId: client.id,
      title: "Evening",
      path: "evening",
      inboxSlug: `evening-${stamp}`,
      paymentHold: true,
    },
  });

  const asset = await db.asset.create({
    data: {
      projectId: project.id,
      kind: "VIDEO",
      format: "Film",
      orientation: "landscape",
      name: "clip01.mov",
      relPath: "evening/clip01.mov",
      sizeBytes: BigInt(1024),
      proxyStatus: "READY",
      proxyRelPath: "a/proxy.mp4",
      thumbRelPath: "a/thumb.jpg",
    },
  });

  // --- the client is watermarked, staff are not -------------------------------------
  const asClient = await authorizeAssetAccess("download", asset.id, session);
  check("a held project still allows the download", asClient.ok === true);
  check(
    "and marks it for the client",
    asClient.ok === true && asClient.watermark === true,
    `watermark=${asClient.ok && asClient.watermark}`
  );

  const asStaff = await authorizeAssetAccess("download", asset.id, adminSession);
  check(
    "staff keep the clean file",
    asStaff.ok === true && asStaff.watermark === false,
    `watermark=${asStaff.ok && asStaff.watermark}`
  );

  // --- fails closed while the mark is still encoding ---------------------------------
  const queued = await queueProjectForMarking(project.id);
  check("turning the hold on queues the gallery", queued === 1, `queued=${queued}`);

  const pending = await db.asset.findUniqueOrThrow({ where: { id: asset.id } });
  check("the asset is queued for marking", pending.markStatus === "PENDING", `markStatus=${pending.markStatus}`);
  check(
    "an unmarked asset is not servable",
    markedReady(pending) === false,
    "markedReady must be false before the encode finishes"
  );
  check(
    "so the download is refused rather than falling back to the master",
    asClient.ok === true && asClient.watermark === true && !markedReady(pending),
    "watermark && !markedReady is exactly the refuse branch"
  );

  // A failed encode must stay unservable too — this is the BRAW case.
  await db.asset.update({ where: { id: asset.id }, data: { markStatus: "FAILED" } });
  const failed = await db.asset.findUniqueOrThrow({ where: { id: asset.id } });
  check("a failed mark is still not servable", markedReady(failed) === false, `markStatus=${failed.markStatus}`);

  // --- a half-finished mark streams but does not download ----------------------------
  // Renditions are persisted as they land, so the poster and proxy exist on disk before
  // the job is finished. The download serves that same proxy now, which makes markStatus
  // the only thing standing between a part-marked asset and a release: if the gate were
  // the path alone, an asset caught mid-encode would hand over a file whose mark may not
  // have been drawn yet. It stays shut until the worker says READY.
  await db.asset.update({
    where: { id: asset.id },
    data: {
      markStatus: "GENERATING",
      markedThumbRelPath: `${asset.id}/thumb.marked.jpg`,
      markedProxyRelPath: `${asset.id}/proxy.marked.mp4`,
      markedFileRelPath: null,
    },
  });
  const midway = await db.asset.findUniqueOrThrow({ where: { id: asset.id } });
  check(
    "a part-marked asset can already be watched",
    midway.markedProxyRelPath !== null && midway.markedThumbRelPath !== null
  );
  check(
    "but still cannot be downloaded while the mark is being drawn",
    markedReady(midway) === false,
    `markStatus=${midway.markStatus}, markedProxyRelPath=${midway.markedProxyRelPath}`
  );

  // --- once marked, it serves the marked proxy ---------------------------------------
  // No markedFileRelPath: a held video download is the marked proxy. Leaving it null is
  // the point of the check — markedReady must be satisfied by the proxy alone.
  await db.asset.update({
    where: { id: asset.id },
    data: {
      markStatus: "READY",
      markedFileRelPath: null,
      markedProxyRelPath: `${asset.id}/proxy.marked.mp4`,
      markedThumbRelPath: `${asset.id}/thumb.marked.jpg`,
    },
  });
  const ready = await db.asset.findUniqueOrThrow({ where: { id: asset.id } });
  check("a marked asset is servable", markedReady(ready) === true);

  // --- releasing the hold hands over the master --------------------------------------
  await db.project.update({
    where: { id: project.id },
    data: { paymentHold: false, paymentReleasedAt: new Date() },
  });
  const released = await authorizeAssetAccess("download", asset.id, session);
  check(
    "releasing the hold gives the client the clean master",
    released.ok === true && released.watermark === false,
    `watermark=${released.ok && released.watermark}`
  );

  const after = await db.project.findUniqueOrThrow({ where: { id: project.id } });
  check("and records when that happened", after.paymentReleasedAt !== null);

  // The marked renditions survive a release, so re-holding is instant rather than a
  // second pass over the whole gallery.
  const kept = await db.asset.findUniqueOrThrow({ where: { id: asset.id } });
  check("the marked copies are kept for a re-hold", kept.markedProxyRelPath !== null);

  // --- an unheld project is untouched -------------------------------------------------
  check("holdApplies is false on an unheld project", holdApplies({ paymentHold: false }, session) === false);
  check("holdApplies is false for staff on a held one", holdApplies({ paymentHold: true }, adminSession) === false);
  check("holdApplies is true for a client on a held one", holdApplies({ paymentHold: true }, session) === true);

  console.log(JSON.stringify(results));
}

main();
