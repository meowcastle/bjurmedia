/**
 * Where a reel's copy stands, from the client's side. One derived value, so the tile
 * line, the viewer pill and the "Captions to check" count can never disagree.
 *
 * NO_SPEECH is the only empty state with a name: the worker listened and found nothing
 * to transcribe, so the client is asked to write one. A failed or never-run
 * transcription is not the client's problem and gets no state at all (null).
 */
export type CaptionState = "DRAFT" | "CHECKED" | "POSTED" | "NO_SPEECH";

export type CaptionFields = {
  contentTitle: string | null;
  caption: string | null;
  captionYT: string | null;
  captionSource: "HUMAN" | "AI";
  transcriptStatus: string;
  postedToSlackAt: string | Date | null;
};

export function hasCopy(a: Pick<CaptionFields, "contentTitle" | "caption" | "captionYT">) {
  return Boolean(a.contentTitle?.trim() || a.caption?.trim() || a.captionYT?.trim());
}

export function captionState(a: CaptionFields): CaptionState | null {
  if (a.postedToSlackAt) return "POSTED";
  if (hasCopy(a)) return a.captionSource === "AI" ? "DRAFT" : "CHECKED";
  if (a.transcriptStatus === "NO_SPEECH") return "NO_SPEECH";
  return null;
}

/** Instagram's caption limit. The route refuses over it; the editor counts toward it. */
export const IG_CAPTION_MAX = 2200;
