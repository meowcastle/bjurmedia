"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientMembership } from "@/lib/auth";

/**
 * Switches which client a multi-client seat is looking at.
 *
 * Renders nothing for the single-client case, which is almost everyone: a switcher
 * offering one option is a control that can only disappoint. Same open/close contract as
 * the other menus in the app.
 */
export function ClientSwitcher({
  memberships,
  activeClientId,
}: {
  memberships: ClientMembership[];
  activeClientId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const active = memberships.find((m) => m.clientId === activeClientId);
  if (memberships.length < 2) return null;

  async function pick(clientId: string) {
    if (clientId === activeClientId) return setOpen(false);
    setSwitching(clientId);
    const res = await fetch("/api/auth/active-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    setSwitching(null);
    setOpen(false);
    if (!res.ok) return;
    // Back to the project list rather than staying put: the current URL is a project
    // belonging to the client we just left, which the new one cannot open.
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative" data-testid="client-switcher">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch client — currently ${active?.clientName ?? "none"}`}
        className="cursor-pointer flex items-center gap-2 text-[13px] text-muted hover:text-text border border-line2 hover:border-text px-3 py-2"
      >
        <span className="font-semibold text-text">{active?.clientName ?? "Select a client"}</span>
        <span className="text-[10px] text-dim">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] min-w-[220px] bg-s2 border border-line2 shadow-[0_18px_50px_rgba(0,0,0,.6)] z-40 py-1"
        >
          <div className="px-3.5 py-2 text-[10px] uppercase tracking-[0.16em] text-dim border-b border-line">
            Your clients
          </div>
          {memberships.map((m) => (
            <button
              key={m.clientId}
              role="menuitem"
              onClick={() => pick(m.clientId)}
              disabled={switching !== null}
              className={`w-full text-left px-3.5 py-2.5 text-[13px] cursor-pointer hover:bg-s3 disabled:opacity-50 ${
                m.clientId === activeClientId ? "text-text font-semibold" : "text-muted hover:text-text"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="truncate">{m.clientName}</span>
                <span className="text-[10px] uppercase tracking-wide text-dim flex-none">
                  {switching === m.clientId ? "…" : m.clientId === activeClientId ? "Viewing" : m.role}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
