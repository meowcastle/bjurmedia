/**
 * Drives the caption pipeline with the transcriber and drafter faked.
 *
 * What matters here is not the model's prose — it is everything around it: that only
 * new eligible reels are ever queued, that a music video produces nothing rather than
 * invented copy, that a person's own words are never overwritten, and that a draft
 * stays marked as one until someone edits it.
 *
 * Run by e2e/captions.spec.ts. Prints one JSON line of results.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { bootstrapHarnessDb, makeChecker, type CheckResult } from "./harness-db";

const DIR = bootstrapHarnessDb();

/**
 * A real one-second clip with a tone on it. The pipeline runs ffmpeg to strip audio
 * before it ever reaches the transcriber, so fixtures that are not decodable make every
 * case fail in extractAudio and prove nothing about the logic under test.
 */
function makeClip(rel: string) {
  const abs = path.join(DIR, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-nostdin", "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1",
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
      abs,
    ],
    { stdio: "pipe" }
  );
  return rel;
}

const results: CheckResult[] = [];
const check = makeChecker(results);

async function main() {
  const { db } = await import("../src/lib/db");
  const { queueForCaptioning, processCaptionQueue } = await import("../src/lib/captionPipeline");

  const client = await db.client.create({
    data: {
      name: "CapCo",
      username: "capco",
      type: "RETAINER",
      autoCaption: true,
      captionStyle: "Hook line first. Name the guest. Sign off with link in bio.",
    },
  });
  const off = await db.client.create({
    data: { name: "OptedOut", username: "optedout", type: "RETAINER", autoCaption: false },
  });
  const project = await db.project.create({
    data: { clientId: client.id, title: "Weekly", path: "cap", inboxSlug: "cap" },
  });
  const offProject = await db.project.create({
    data: { clientId: off.id, title: "Quiet", path: "off", inboxSlug: "off" },
  });

  let n = 0;
  const mkAsset = (over: Record<string, unknown> = {}) => {
    n++;
    return db.asset.create({
      data: {
        projectId: project.id,
        kind: "VIDEO",
        format: "Reel",
        orientation: "portrait",
        name: `clip_${n}.mp4`,
        relPath: `cap/clip_${n}.mp4`,
        sizeBytes: BigInt(1),
        proxyRelPath: makeClip(`cap/clip_${n}.mp4`),
        ...over,
      },
    });
  };

  // ---- eligibility ----
  const reel = await mkAsset();
  check("a new reel for an opted-in client is queued", await queueForCaptioning(reel.id));

  const still = await mkAsset({ kind: "PHOTO", format: "Still" });
  check("a still is not", !(await queueForCaptioning(still.id)));

  const master = await mkAsset({ format: "Master" });
  check("a master is not", !(await queueForCaptioning(master.id)));

  const internal = await mkAsset({ internal: true });
  check("internal work is not", !(await queueForCaptioning(internal.id)));

  const otherClient = await db.asset.create({
    data: {
      projectId: offProject.id,
      kind: "VIDEO",
      format: "Reel",
      orientation: "portrait",
      name: "off.mp4",
      relPath: "off/off.mp4",
      sizeBytes: BigInt(1),
    },
  });
  check("a client who has not opted in is never queued", !(await queueForCaptioning(otherClient.id)));

  // Nothing that predates the feature is touched: queueForCaptioning is the only way
  // in, and it is called at ingest.
  const legacy = await mkAsset();
  check("an asset nobody queued stays NONE", legacy.transcriptStatus === "NONE");

  // ---- the happy path ----
  const configured = () => true;
  const transcribe = async () => ({ text: "We shot this on the roof at golden hour.", confidence: 0.94 });
  // Capture what the drafter is handed, so the style plumbing is checked rather than
  // assumed — a style guide that never reaches the model is the failure that looks
  // exactly like the model ignoring it.
  let lastDraftInput: Record<string, unknown> = {};
  const frames = async () => ["ZmFrZS1qcGVn", "ZmFrZS1qcGVnLTI="];
  const draft = async (input: Record<string, unknown>) => {
    lastDraftInput = input;
    return {
      instagram: "Golden hour on the roof, and the whole crew stayed late to catch it properly.",
      youtubeTitle: "Rooftop, golden hour",
      youtube: "A short piece shot on the roof at golden hour.",
    };
  };

  await processCaptionQueue({ configured, drafting: () => true, transcribe, draft, frames });
  const r1 = await db.asset.findUniqueOrThrow({ where: { id: reel.id } });
  check("the transcript is stored", r1.transcriptStatus === "DONE" && !!r1.transcript, r1.transcriptStatus);
  check("a caption is drafted", r1.caption?.startsWith("Golden hour on the roof") === true, r1.caption ?? "null");
  check("the YouTube copy is drafted separately", r1.captionYT?.startsWith("A short piece") === true);
  check("and it is marked as a draft", r1.captionSource === "AI", r1.captionSource);

  check(
    "the client's house style reaches the drafter",
    typeof lastDraftInput.styleGuide === "string" &&
      String(lastDraftInput.styleGuide).includes("Hook line"),
    JSON.stringify(lastDraftInput.styleGuide)
  );

  // ---- no speech ----
  const music = await mkAsset();
  await queueForCaptioning(music.id);
  await processCaptionQueue({ configured, drafting: () => true, transcribe: async () => ({ text: "", confidence: null }), draft, frames });
  const r2 = await db.asset.findUniqueOrThrow({ where: { id: music.id } });
  check(
    "a clip with no dialogue is still recorded as NO_SPEECH",
    r2.transcriptStatus === "NO_SPEECH",
    r2.transcriptStatus
  );
  check(
    "but it now gets a caption written from the stills",
    !!r2.caption,
    r2.caption ?? "null"
  );
  check(
    "and the drafter was actually shown frames",
    Array.isArray(lastDraftInput.frames) && (lastDraftInput.frames as string[]).length === 2,
    JSON.stringify((lastDraftInput.frames as string[] | undefined)?.length)
  );

  const blank = await mkAsset();
  await queueForCaptioning(blank.id);
  await processCaptionQueue({
    configured,
    drafting: () => true,
    transcribe: async () => ({ text: "", confidence: null }),
    draft,
    frames: async () => [],
  });
  const rBlank = await db.asset.findUniqueOrThrow({ where: { id: blank.id } });
  check(
    "no dialogue and no usable stills means no caption at all",
    rBlank.transcriptStatus === "NO_SPEECH" && !rBlank.caption,
    `${rBlank.transcriptStatus} / ${rBlank.caption}`
  );

  // ---- never overwrite a person ----
  const HOUSE = "Hook line that lands. Jordan gets candid about the parts nobody films. Full interview on YouTube, link in bio.";
  const written = await mkAsset({ caption: HOUSE, captionSource: "HUMAN" });
  await queueForCaptioning(written.id);
  await processCaptionQueue({ configured, drafting: () => true, transcribe, draft, frames });
  const r3 = await db.asset.findUniqueOrThrow({ where: { id: written.id } });
  check("a caption a person wrote is left alone", r3.caption === HOUSE, r3.caption ?? "null");
  check("but the transcript is still stored", !!r3.transcript);

  // The next draft should be shown that human caption as an example of the house voice.
  const nextUp = await mkAsset();
  await queueForCaptioning(nextUp.id);
  await processCaptionQueue({ configured, drafting: () => true, transcribe, draft, frames });
  const examples = (lastDraftInput.examples ?? []) as string[];
  check(
    "captions a person wrote become examples for the next draft",
    examples.some((e) => e.includes("Hook line that lands")),
    `${examples.length} example(s): ${examples.map((e) => e.slice(0, 30)).join(" | ")}`
  );
  check(
    "the model's own drafts are never fed back as examples",
    !examples.some((e) => e.includes("Golden hour on the roof")),
    examples.join(" | ").slice(0, 120)
  );

  // ---- failure is recorded, not silent ----
  const broken = await mkAsset();
  await queueForCaptioning(broken.id);
  await processCaptionQueue({
    configured,
    drafting: () => true,
    transcribe: async () => {
      throw new Error("provider exploded");
    },
    draft,
  });
  const r4 = await db.asset.findUniqueOrThrow({ where: { id: broken.id } });
  check(
    "a provider failure is recorded on the row",
    r4.transcriptStatus === "FAILED" && /exploded/.test(r4.transcriptError ?? ""),
    `${r4.transcriptStatus} / ${r4.transcriptError}`
  );

  // ---- a claimed row is not picked up twice ----
  const stuck = await mkAsset({ transcriptStatus: "RUNNING" });
  let calls = 0;
  await processCaptionQueue({
    configured,
    drafting: () => true,
    transcribe: async () => {
      calls++;
      return { text: "hello there friend", confidence: 1 };
    },
    draft,
  });
  const r5 = await db.asset.findUniqueOrThrow({ where: { id: stuck.id } });
  check("a row left mid-run is not silently retried", r5.transcriptStatus === "RUNNING" && calls === 0, `${r5.transcriptStatus} / ${calls} calls`);

  // ---- idle without a key ----
  const idle = await mkAsset();
  await queueForCaptioning(idle.id);
  await processCaptionQueue({ configured: () => false, drafting: () => true, transcribe, draft });
  const r6 = await db.asset.findUniqueOrThrow({ where: { id: idle.id } });
  check("nothing runs without a provider key", r6.transcriptStatus === "PENDING", r6.transcriptStatus);

  await db.$disconnect();
  console.log(JSON.stringify(results));
}

main().catch((err) => {
  console.log(JSON.stringify([{ name: "harness crashed", pass: false, detail: String(err) }]));
  process.exit(0);
});
