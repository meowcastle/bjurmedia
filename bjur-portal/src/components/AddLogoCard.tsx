"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const KEY = "bjur:v13:addLogoDismissed";
const subscribe = () => () => {};
const dismissedNow = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * One time, in Settings, when we couldn't find the client's logo anywhere (v13 §4). Until
 * then the portal shows their initials on a colour. Dismissing it hides it for good on
 * this browser; adding a logo hides it everywhere.
 */
export function AddLogoCard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const stored = useSyncExternalStore(subscribe, dismissedNow, () => true);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (stored || hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setHidden(true);
  }

  async function upload(file: File) {
    setBusy(true);
    setErr("");
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/client/logo", { method: "POST", body }).catch(() => null);
    const out = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setErr(out?.error ?? "That didn't upload. Try again.");
    dismiss();
    router.refresh();
  }

  return (
    <section className="bj-addlogo" aria-label="Add your logo">
      <div>
        <b>Add your logo</b>
        <p>We couldn&apos;t find it, so the portal shows your initials. A square PNG or JPG, at least 128px, works best.</p>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
      <div className="acts">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" className="bj-cta" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : <>Upload logo <i aria-hidden="true">&rarr;</i></>}
        </button>
        <button type="button" className="bj-link" style={{ background: "none", borderTop: 0, borderLeft: 0, borderRight: 0, cursor: "pointer", color: "var(--text)" }} onClick={dismiss}>
          Not now
        </button>
      </div>
    </section>
  );
}
