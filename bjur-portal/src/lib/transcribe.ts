import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";

/**
 * Speech-to-text for delivered video.
 *
 * One interface with Deepgram behind it, because which provider is "best" moves every
 * few months and is heavily domain-dependent — the model that wins on podcasts often
 * loses on music-backed social video. Swapping after a bake-off should be a config
 * change, not a rewrite.
 */

export type Transcript = {
  /** Empty string means the audio carried no usable dialogue, which is not a failure. */
  text: string;
  /** Provider's own confidence, 0–1, when it reports one. */
  confidence: number | null;
};

export type Transcriber = (audioPath: string) => Promise<Transcript>;

export function transcriptionConfigured() {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

/**
 * Pulls a small mono 16kHz WAV out of the video.
 *
 * Speech models resample to 16kHz mono anyway, so sending the original video would be
 * uploading tens of megabytes of picture to be thrown away. A three-minute reel comes
 * out around 5MB.
 */
export async function extractAudio(videoPath: string): Promise<string> {
  const out = path.join(os.tmpdir(), `bjur-audio-${randomBytes(6).toString("hex")}.wav`);
  await new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-nostdin",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-y",
      out,
    ]);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString().slice(0, 2000)));
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))
    );
  });
  return out;
}

export async function discardAudio(audioPath: string) {
  await unlink(audioPath).catch(() => {});
}

/**
 * Deepgram. Chosen for audio that is not clean speech — music beds, room tone,
 * overlapping voices — where Whisper-lineage models tend to produce fluent-sounding
 * text that was never said. smart_format gives punctuation and capitalisation, which
 * matters because this copy is read, not just searched.
 */
export const deepgramTranscriber: Transcriber = async (audioPath) => {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set.");

  const body = await readFile(audioPath);
  const params = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL ?? "nova-3",
    smart_format: "true",
    punctuate: "true",
    detect_language: "true",
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    throw new Error(`Deepgram responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    results?: {
      channels?: { alternatives?: { transcript?: string; confidence?: number }[] }[];
    };
  };
  const best = json.results?.channels?.[0]?.alternatives?.[0];

  return {
    text: (best?.transcript ?? "").trim(),
    confidence: typeof best?.confidence === "number" ? best.confidence : null,
  };
};
