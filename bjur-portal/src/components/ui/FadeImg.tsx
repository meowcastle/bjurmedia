"use client";

import { useCallback, useState } from "react";

/**
 * A thumbnail that fades in over its placeholder instead of popping (PORTAL-POLISH §3).
 *
 * Sits inside a relatively positioned box that already paints the gradient placeholder.
 * Until the image loads, a slow 6% shimmer runs over that gradient; then the image fades
 * in on --dur-2. Lazy and async-decoded so a long gallery does not fetch and decode
 * everything up front. The ref check covers a cached image that finished loading before
 * React attached onLoad, which would otherwise stay invisible.
 */
export function FadeImg({
  src,
  className = "",
  onError,
}: {
  src: string;
  className?: string;
  onError?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <>
      {!loaded && <span aria-hidden className="absolute inset-0 bj-shimmer" />}
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize */}
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={onError}
        className={`transition-opacity duration-(--dur-2) ease-std ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
      />
    </>
  );
}
