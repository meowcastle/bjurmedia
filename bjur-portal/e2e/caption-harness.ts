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
    data: { name: "CapCo", username: "capco", type: "RETAINER", autoCaption: true },
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
  const draft = async () => ({
    instagram: "Golden hour on the roof.",
    youtubeTitle: "Rooftop, golden hour",
    youtube: "A short piece shot on the roof at golden hour.",
  });

  await processCaptionQueue({ configured, drafting: () => true, transcribe, draft });
  const r1 = await db.asset.findUniqueOrThrow({ where: { id: reel.id } });
  check("the transcript is stored", r1.transcriptStatus === "DONE" && !!r1.transcript, r1.transcriptStatus);
  check("a caption is drafted", r1.caption === "Golden hour on the roof.", r1.caption ?? "null");
  check("the YouTube copy is drafted separately", r1.captionYT?.startsWith("A short piece") === true);
  check("and it is marked as a draft", r1.captionSource === "AI", r1.captionSource);

  // ---- no speech ----
  const music = await mkAsset();
  await queueForCaptioning(music.id);
  await processCaptionQueue({ configured, drafting: () => true, transcribe: async () => ({ text: "", confidence: null }), draft });
  const r2 = await db.asset.findUniqueOrThrow({ where: { id: music.id } });
  check(
    "a music video gets no invented caption",
    r2.transcriptStatus === "NO_SPEECH" && !r2.caption,
    `${r2.transcriptStatus} / ${r2.caption}`
  );

  // ---- never overwrite a person ----
  const written = await mkAsset({ caption: "My own words.", captionSource: "HUMAN" });
  await queueForCaptioning(written.id);
  await processCaptionQueue({ configured, drafting: () => true, transcribe, draft });
  const r3 = await db.asset.findUniqueOrThrow({ where: { id: written.id } });
  check("a caption a person wrote is left alone", r3.caption === "My own words.", r3.caption ?? "null");
  check("but the transcript is still stored", !!r3.transcript);

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
