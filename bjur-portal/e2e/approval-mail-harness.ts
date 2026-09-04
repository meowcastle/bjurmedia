/**
 * Drives the approval email with the transport faked.
 *
 * Who gets asked is the part worth pinning down: the email offers Approve and Hold, and
 * the in-app buttons are owner-only, so a mail reaching a downloader would be offering
 * an action the portal refuses. The signed links are checked here too — an Approve link
 * must not be editable into a Hold.
 *
 * Run by e2e/approval-mail.spec.ts. Prints one JSON line of results.
 */
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

process.env.SESSION_SECRET = "harness-secret-not-a-real-one";
process.env.PORTAL_URL = "https://portal.example.test";
bootstrapHarnessDb();

const results: CheckResult[] = [];
const check = makeChecker(results);

async function main() {
  const { db } = await import("../src/lib/db");
  const { sendApprovalRequest } = await import("../src/lib/approvalMail");
  const { verifyPublishToken } = await import("../src/lib/publishToken");

  const client = await db.client.create({
    data: { name: "MailCo", username: "mailco", type: "RETAINER", approvalAutoHours: 24 },
  });
  const project = await db.project.create({
    data: { clientId: client.id, title: "Mail Project", path: "mail", inboxSlug: "mail" },
  });

  const mk = (email: string, role: "OWNER" | "DOWNLOADER" | "VIEWER", over = {}) =>
    db.user.create({
      data: { clientId: client.id, email, name: "A Person", role, passwordHash: "x", ...over },
    });

  const owner = await mk("owner@mailco.test", "OWNER");
  await mk("downloader@mailco.test", "DOWNLOADER");
  await mk("viewer@mailco.test", "VIEWER");
  await mk("gone@mailco.test", "OWNER", { deactivatedAt: new Date() });

  const publishAt = new Date(Date.now() + 48 * 3_600_000);
  const asset = await db.asset.create({
    data: {
      projectId: project.id,
      kind: "VIDEO",
      format: "Reel",
      orientation: "portrait",
      name: "mail_test.mp4",
      relPath: "mail/mail_test.mp4",
      sizeBytes: BigInt(1),
      contentTitle: "TOVA (FAM ONLY)",
      caption: "a caption",
      publishAt,
      publishIg: true,
      publishState: "AWAITING",
      approvalDueAt: new Date(Date.now() + 24 * 3_600_000),
    },
  });

  type Sent = { to: string; props: Record<string, unknown> };
  let sent: Sent[] = [];
  const send = async (to: string, props: Record<string, unknown>) => {
    sent.push({ to, props });
    return { sent: true } as never;
  };

  // ---- 1. owners only ----
  await sendApprovalRequest(asset.id, { deps: { send } });
  check(
    "asks the owner and nobody else",
    sent.length === 1 && sent[0].to === owner.email,
    sent.map((s) => s.to).join(", ") || "nothing sent"
  );
  check(
    "skips a deactivated owner seat",
    !sent.some((s) => s.to === "gone@mailco.test")
  );

  // ---- 2. the links are signed, bound, and correct ----
  const props = sent[0]?.props ?? {};
  const tokenOf = (url: string) => new URL(url).searchParams.get("t");
  const approve = verifyPublishToken(tokenOf(String(props.approveUrl)));
  const hold = verifyPublishToken(tokenOf(String(props.holdUrl)));
  check(
    "the approve link is signed and says approve",
    approve?.action === "approve" && approve?.assetId === asset.id,
    JSON.stringify(approve)
  );
  check("the hold link says hold", hold?.action === "hold" && hold?.assetId === asset.id);
  check(
    "the links expire when the post was due out",
    approve?.exp === publishAt.getTime(),
    `${approve?.exp} vs ${publishAt.getTime()}`
  );

  // ---- 3. a tampered token is refused ----
  const raw = tokenOf(String(props.approveUrl))!;
  const swapped = raw.replace(/^[^.]+/, Buffer.from(JSON.stringify({ ...approve, action: "hold" })).toString("base64url"));
  check("an approve link cannot be edited into a hold", verifyPublishToken(swapped) === null);
  check("a token with a broken signature is refused", verifyPublishToken(raw.slice(0, -2) + "xx") === null);
  check("garbage is refused rather than throwing", verifyPublishToken("not-a-token") === null);

  // ---- 4. expiry is enforced ----
  const { signPublishToken } = await import("../src/lib/publishToken");
  const stale = signPublishToken({ assetId: asset.id, action: "approve", exp: Date.now() - 1000 });
  check("an expired token is refused", verifyPublishToken(stale) === null);

  // ---- 5. nothing is sent for a post that is not waiting ----
  sent = [];
  await db.asset.update({ where: { id: asset.id }, data: { publishState: "APPROVED" } });
  await sendApprovalRequest(asset.id, { deps: { send } });
  check("does not ask about a post that is no longer waiting", sent.length === 0, String(sent.length));

  // ---- 6. a failing transport does not propagate ----
  await db.asset.update({ where: { id: asset.id }, data: { publishState: "AWAITING" } });
  let threw = false;
  try {
    await sendApprovalRequest(asset.id, {
      deps: {
        send: async () => {
          throw new Error("smtp is down");
        },
      },
    });
  } catch {
    threw = true;
  }
  check("a failing transport never propagates to the caller", !threw);

  // ---- 7. reminder wording is distinguishable ----
  sent = [];
  await sendApprovalRequest(asset.id, { isReminder: true, deps: { send } });
  check("a reminder is flagged as one", sent[0]?.props.isReminder === true);

  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err) }]));
  process.exit(0);
});
