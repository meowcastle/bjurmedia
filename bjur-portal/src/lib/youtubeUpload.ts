import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";

/**
 * videos.insert over the resumable endpoint.
 *
 * Resumable rather than a simple multipart upload because these are real video files —
 * a delivery reel is routinely hundreds of megabytes — and the simple endpoint wants the
 * whole body in one shot with no way to recover a broken connection partway.
 *
 * The body is streamed from disk. Reading a 2GB file into a Buffer to hand to fetch
 * would work right up until it didn't, on a NAS with other things running.
 */

export type YouTubeUploadInput = {
  filePath: string;
  title: string;
  description: string;
  /** YouTube rejects any single tag over 30 chars and the set over 500. */
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
};

export async function uploadVideo(accessToken: string, input: YouTubeUploadInput) {
  const { size } = await stat(input.filePath);

  const metadata = {
    snippet: {
      // YouTube hard-caps these; sending over the limit fails the whole upload with a
      // 400 after the bytes have already gone up.
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 5000),
      tags: (input.tags ?? []).filter((t) => t.length <= 30).slice(0, 15),
    },
    status: {
      privacyStatus: input.privacyStatus ?? "public",
      // Required since 2020; omitting it is an upload error, and declaring it wrongly is
      // a legal problem rather than a technical one, so it is stated explicitly.
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Length": String(size),
        "X-Upload-Content-Type": "video/*",
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) {
    throw new Error(`YouTube upload init failed: ${initRes.status} ${await initRes.text()}`);
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube upload init returned no upload URL.");

  const body = Readable.toWeb(createReadStream(input.filePath)) as ReadableStream;
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/*", "Content-Length": String(size) },
    body,
    // Required by undici whenever the body is a stream: without it the request is
    // rejected before a byte leaves the machine.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!uploadRes.ok) {
    throw new Error(`YouTube upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const json = (await uploadRes.json()) as { id?: string };
  if (!json.id) throw new Error("YouTube accepted the upload but returned no video id.");

  return { videoId: json.id, permalink: `https://www.youtube.com/watch?v=${json.id}` };
}
