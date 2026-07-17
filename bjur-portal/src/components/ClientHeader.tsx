"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ClientHeader({ clientName, userName }: { clientName: string; userName: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4 px-4 sm:px-6 md:px-10 py-4 border-b-2 border-line2 sticky top-0 bg-bg/90 backdrop-blur-md z-20">
      <Link href="/" className="flex items-center gap-2.5 flex-none">
        <div className="w-3.5 h-3.5 bg-accent flex-none" />
        <span className="font-black text-[15px]">BJUR</span>
        <span className="font-semibold tracking-[0.3em] text-[11px] text-muted">MEDIA</span>
      </Link>

      {/* Desktop/tablet: full inline actions */}
      <div className="ml-auto hidden sm:flex items-center gap-4">
        <Link href="/settings" className="flex items-center gap-3 hover:opacity-80">
          <span className="text-[13px] text-muted">{clientName}</span>
          <div className="w-[30px] h-[30px] bg-s3 grid place-items-center text-xs font-bold flex-none">
            {initials(userName)}
          </div>
        </Link>
        <button
          onClick={signOut}
          className="text-xs font-semibold text-muted hover:text-text px-1.5 py-1.5 cursor-pointer"
        >
          Sign out
        </button>
      </div>

      {/* Mobile: consolidate into a single menu so the header never has to squeeze
          the logo, client name, avatar, and sign-out into one non-wrapping row. */}
      <div className="ml-auto relative sm:hidden">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          className="w-9 h-9 grid place-items-center text-text cursor-pointer flex-none"
        >
          <span className="text-2xl leading-none tracking-[2px]">⋮</span>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-60 bg-s2 border border-line2 z-40 bjfade">
              <div className="px-4 py-3 border-b border-line">
                <div className="text-[10px] text-dim uppercase tracking-wide font-semibold">Signed in as</div>
                <div className="text-sm font-semibold truncate mt-0.5">{clientName}</div>
              </div>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-sm text-text hover:bg-white/[0.04] border-b border-line"
              >
                Settings
              </Link>
              <button
                onClick={signOut}
                className="w-full text-left px-4 py-3 text-sm text-text hover:bg-white/[0.04] cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
