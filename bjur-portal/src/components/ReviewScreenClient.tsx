"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReviewScreen, type ReviewScreenProps, type ScreenCut, type ScreenNote } from "@/components/ReviewScreen";
import { REVIEW_TOKEN_HEADER } from "@/lib/reviewToken";

/**
 * Wires the review screen to its routes.
 *
 * Kept apart from ReviewScreen so that screen stays a view — it takes data and callbacks
 * and knows nothing about fetch, which is what lets the studio page reuse it with an
 * entirely different set of actions.
 *
 * `guestToken` is passed on every write when present. A guest has no session, and this is
 * the only thing standing between them and a 403.
 */
export function ReviewScreenClient({
  guestToken,
  ...props
}: Omit<
  ReviewScreenProps,
  "activeCutId" | "onSelectCut" | "onAddNote" | "onDeleteNote" | "onSendNotes" | "onApprove" | "onUndoApprove"
> & {
  guestToken?: string;
  cuts: ScreenCut[];
  notes: ScreenNote[];
  previousNotes: ScreenNote[];
  initialCutId: string;
}) {
  const router = useRouter();
  const [activeCutId, setActiveCutId] = useState(props.initialCutId);

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(guestToken ? { [REVIEW_TOKEN_HEADER]: guestToken } : {}),
  };
  const cutId = props.initialCutId;

  async function call(path: string, init?: RequestInit) {
    await fetch(path, { headers, ...init });
    router.refresh();
  }

  return (
    <ReviewScreen
      {...props}
      activeCutId={activeCutId}
      onSelectCut={setActiveCutId}
      onAddNote={(timeSec, body) =>
        call(`/api/reviews/${cutId}/notes`, { method: "POST", body: JSON.stringify({ timeSec, body }) })
      }
      onDeleteNote={(noteId) => call(`/api/reviews/${cutId}/notes/${noteId}`, { method: "DELETE" })}
      onSendNotes={() => call(`/api/reviews/${cutId}/send`, { method: "POST" })}
      onApprove={() => call(`/api/reviews/${cutId}/approve`, { method: "POST" })}
      onUndoApprove={() => call(`/api/reviews/${cutId}/approve`, { method: "DELETE" })}
    />
  );
}
