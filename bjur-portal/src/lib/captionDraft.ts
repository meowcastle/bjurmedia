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
  /** The client's house style in their own words. */
  styleGuide?: string | null;
  /** Recent captions a person actually wrote for this client, newest first. */
  examples?: string[];
  /** Base64 JPEG stills from across the clip, for visual pieces with little dialogue. */
  frames?: string[];
}) => Promise<CaptionDraft>;

export function draftingConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You write social copy for a film production studio's client deliveries.

You are given a transcript of the spoken audio from one short video, and you draft the
post copy for it.

The only rules that never bend:

- Write from what is actually said and shown. Never invent a fact, name, credit, date,
  statistic or claim that is not in the transcript or the context given. If someone's
  role or affiliation is not stated, do not assign one.
- You may be given stills from the clip. Describe what is happening in them, but never
  identify a person from their appearance, and never name a place, brand, venue or song
  you recognise on sight. Recognising a face is exactly the kind of confident guess that
  puts the wrong name on a client's post. Names come only from the transcript or the
  context above.
- When there is no dialogue, write about what the clip shows and let it be short. A
  performance clip does not need a story attached to it.
- If the transcript is thin or ambiguous, write something short and general rather than
  padding it with invention. Short and true beats long and wrong.
- Never address the client or the studio. This is the post itself, not a note about it.
- YouTube titles stay under 70 characters.

Everything else — length, tone, emoji, hashtags, sign-off, whether to name the guest —
follows the client's house style below and the examples of their own past posts. Match
how they actually write. Where the style guide and these instructions disagree about
anything other than the rules above, the style guide wins.

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
            // Stills first: the model reads them as context for the text that follows,
            // and a trailing image tends to get treated as an afterthought.
            ...(input.frames ?? []).map((data) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: "image/jpeg" as const,
                data,
              },
            })),
            {
              type: "text" as const,
              text: [
                `Client: ${input.clientName}`,
                `Project: ${input.projectTitle}`,
                `File: ${input.assetName}`,
                input.durationSec ? `Duration: ${input.durationSec}s` : "",
                "",
                input.styleGuide
                  ? `House style for ${input.clientName}:\n${input.styleGuide}\n`
                  : "",
                // Their own recent posts do more than any description of tone can: the model
                // can see the shape, the sign-off and the hashtag habit rather than being
                // told about them.
                input.examples?.length
                  ? `Recent posts this client wrote themselves — match this voice:\n\n${input.examples
                      .map((e, i) => `Example ${i + 1}:\n${e}`)
                      .join("\n\n")}\n`
                  : "",
                input.transcript.trim()
                  ? `Transcript:\n${input.transcript}`
                  : "No dialogue in this clip — write from the stills.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Anthropic responded ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
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
