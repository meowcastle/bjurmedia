/**
 * Turns a transcript into a first draft of the social copy.
 *
 * Everything here lands as a draft. The asset is marked captionSource: AI and stays
 * marked until a person edits it, because a caption that reads as finished and is
 * subtly wrong is worse than an empty box — you skim it instead of reading it.
 */

export type CaptionDraft = {
  /** IG body. Plain text; no hashtag wall unless the transcript earns one. */
  instagram: string;
  /** YouTube needs a title as well as a body. */
  youtubeTitle: string;
  youtube: string;
};

export type CaptionDrafter = (input: {
  transcript: string;
  clientName: string;
  projectTitle: string;
  assetName: string;
  durationSec: number | null;
}) => Promise<CaptionDraft>;

export function draftingConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You write social copy for a film production studio's client deliveries.

You are given a transcript of the spoken audio from one short video, and you draft the
post copy for it. Rules:

- Write from what is actually said. Never invent a fact, name, location, product claim
  or statistic that is not in the transcript.
- If the transcript is thin or ambiguous, write something short and general rather than
  padding it with invention. Short and true beats long and wrong.
- No emoji. No hashtag walls — at most two, and only if the subject is obvious.
- Instagram: 1-3 sentences, conversational, no "link in bio" unless the transcript says
  there is one.
- YouTube title: under 70 characters, specific, no clickbait punctuation.
- YouTube description: 2-4 sentences, slightly more informative than the Instagram copy.
- Never address the client or the studio in the copy. This is the post itself, not a
  note about the post.

Reply with only a JSON object: {"instagram": "...", "youtubeTitle": "...", "youtube": "..."}`;

export const claudeDrafter: CaptionDrafter = async (input) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      // An org-level key has to name the workspace to bill against; a workspace-scoped
      // key already carries it and this header would be redundant. Supporting both
      // means whichever key someone creates in the console just works.
      ...(process.env.ANTHROPIC_WORKSPACE_ID
        ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
        : {}),
    },
    body: JSON.stringify({
      model: process.env.CAPTION_MODEL ?? "claude-sonnet-5",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Client: ${input.clientName}`,
            `Project: ${input.projectTitle}`,
            `File: ${input.assetName}`,
            input.durationSec ? `Duration: ${input.durationSec}s` : "",
            "",
            "Transcript:",
            input.transcript,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? []).find((c) => c.type === "text")?.text ?? "";

  // Tolerate a fenced block or stray prose around the object rather than failing the
  // whole job over formatting.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return a JSON object.");

  const parsed = JSON.parse(match[0]) as Partial<CaptionDraft>;
  if (!parsed.instagram || !parsed.youtubeTitle || !parsed.youtube) {
    throw new Error("Model returned an incomplete draft.");
  }

  return {
    instagram: parsed.instagram.trim(),
    youtubeTitle: parsed.youtubeTitle.trim(),
    youtube: parsed.youtube.trim(),
  };
};
