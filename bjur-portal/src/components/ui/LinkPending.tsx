"use client";

import { useLinkStatus } from "next/link";

/**
 * A spinner over the link that was just tapped, shown until the next page is ready.
 *
 * Not a `loading.tsx`: a route-level loading boundary streams the response, and once the
 * 200 has gone out a page's `notFound()` can no longer turn it into a 404 — which is what
 * the access rules on /p/[id] and /send rely on. Must render inside a <Link>.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      role="status"
      aria-label="Loading"
      className="absolute inset-0 grid place-items-center bg-black/40 z-10"
    >
      <span className="w-5 h-5 border-2 border-white/40 border-t-accent rounded-full bjspin inline-block" />
    </span>
  );
}
