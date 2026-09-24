"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReviewScreenClient } from "@/components/ReviewScreenClient";
import { REVIEW_TOKEN_HEADER } from "@/lib/reviewToken";
import type { ScreenCut, ScreenNote } from "@/components/ReviewScreen";

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
      <div className="fixed inset-0 bg-black text-white grid place-items-center px-6">
        <div className="w-full max-w-[360px]">
          <div className="bj-serif text-[26px]">Bjur</div>
          <div className="text-[11px] font-mono uppercase tracking-[.1em] text-white/45 mt-1.5">
            {data.clientName} · {data.projectTitle}
          </div>
          <p className="text-[13px] leading-relaxed text-white/60 mt-5">
            Your notes go out with your name on them, so the studio knows who asked for what.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
            placeholder="Your name"
            autoFocus
            data-testid="guest-name"
            className="mt-4 w-full bg-transparent border border-white/25 focus:border-white outline-none px-3 py-2.5 text-[14px]"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || saving}
            data-testid="guest-continue"
            className="mt-3 w-full py-2.5 text-[12px] font-semibold uppercase tracking-[.08em] cursor-pointer disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#0b0b0c" }}
          >
            Watch the cut
          </button>
        </div>
      </div>
    );
  }

  if (data.empty) {
    return (
      <div className="fixed inset-0 bg-black text-white grid place-items-center px-6">
        <div className="max-w-sm text-center">
          <div className="bj-serif text-[26px]">{data.projectTitle}</div>
          <p className="text-[13px] leading-relaxed text-white/60 mt-4">
            No cut yet. You&apos;ll get an email when there is one.
          </p>
        </div>
      </div>
    );
  }

  return <ReviewScreenClient mode="client" guestToken={token} {...data} />;
}
