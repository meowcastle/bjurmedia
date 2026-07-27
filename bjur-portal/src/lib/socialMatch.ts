const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export type MatchCandidateAsset = {
  id: string;
  kind: "PHOTO" | "VIDEO";
  name: string;
  weekOf: Date | null;
  createdAt: Date;
};

export type MatchableSocialPost = {
  kind: "PHOTO" | "VIDEO";
  caption: string | null;
  postedAt: Date;
};

function filenameStem(name: string) {
  return name.replace(/\.[^.]+$/, "").trim();
}

/**
 * Auto-matches a fetched social post to exactly one delivered asset, or returns
 * null if the signals don't converge on a single candidate — an ambiguous or
 * absent match is left for manual review rather than guessed at.
 *
 * Two independent signals must both agree: the asset's delivery date (weekOf,
 * falling back to createdAt when unset) within ±3 days of the post, and the
 * asset's filename (minus extension) appearing in the post's caption.
 */
export function matchAssetForPost(
  post: MatchableSocialPost,
  candidates: MatchCandidateAsset[]
): MatchCandidateAsset | null {
  if (!post.caption) return null;
  const caption = post.caption.toLowerCase();

  const matches = candidates.filter((a) => {
    if (a.kind !== post.kind) return false;

    const refDate = a.weekOf ?? a.createdAt;
    if (Math.abs(refDate.getTime() - post.postedAt.getTime()) > MATCH_WINDOW_MS) return false;

    const stem = filenameStem(a.name).toLowerCase();
    return stem.length > 0 && caption.includes(stem);
  });

  return matches.length === 1 ? matches[0] : null;
}
