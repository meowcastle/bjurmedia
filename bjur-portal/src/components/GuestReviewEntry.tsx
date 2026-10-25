"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReviewScreenClient } from "@/components/ReviewScreenClient";
import { REVIEW_TOKEN_HEADER } from "@/lib/reviewToken";
import { ReviewShell, type ScreenCut, type ScreenNote } from "@/components/ReviewScreen";

type Loaded =
  | { empty: true; clientName: string; projectTitle: string; viewerName: string }
  | {
      empty: false;
      clientName: string;
      projectTitle: string;
      assetTitle: string;
      cuts: ScreenCut[];
      initialCutId: string;
      notes: ScreenNote[];
      previousNotes: ScreenNote[];
      viewer: { id: string; name: string; role: string | null; canApprove: boolean };
    };

/**
 * The guest's first screen: their name, once.
 *
 * Asked before the player rather than alongside it because every note they leave is
 * attributed, and a note signed "" is worse than no note — the studio cannot tell the
 * director from the label. It is the only thing ever asked of a guest.
 */
export function GuestReviewEntry({
  token,
  needsName,
  reviewerId,
  data,
}: {
  token: string;
  needsName: boolean;
  reviewerId: string;
  data: Loaded;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    await fetch(`/api/reviews/guest/${reviewerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", [REVIEW_TOKEN_HEADER]: token },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    router.refresh();
  }

  if (needsName) {
    return (
      <ReviewShell mode="client" clientName={data.clientName}>
        <section className="bj-rv-solo">
          <span className="bj-mono">
            {data.clientName} · {data.projectTitle}
          </span>
          <h1 className="bj-mid">{data.projectTitle}</h1>
          <label className="fld" htmlFor="guest-name">
            <span className="bj-mono">Your name</span>
            <input
              id="guest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void save()}
              autoFocus
              autoComplete="name"
              data-testid="guest-name"
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || saving}
            data-testid="guest-continue"
            className="bj-cta"
          >
            Watch the cut <i>→</i>
          </button>
        </section>
      </ReviewShell>
    );
  }

  if (data.empty) {
    return (
      <ReviewShell mode="client" clientName={data.clientName}>
        <section className="bj-rv-solo">
          <span className="bj-mono">{data.clientName}</span>
          <h1 className="bj-mid">{data.projectTitle}</h1>
          <p className="bj-lead">No cut yet. You&apos;ll get an email when there is one.</p>
        </section>
      </ReviewShell>
    );
  }

  return <ReviewScreenClient mode="client" guestToken={token} {...data} />;
}
