"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/initials";
import { IconMore } from "@/components/ui/Icon";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import type { ClientMembership } from "@/lib/auth";

export function ClientHeader({
  clientName,
  userName,
  memberships = [],
  activeClientId = null,
}: {
  clientName: string;
  userName: string;
  memberships?: ClientMembership[];
  activeClientId?: string | null;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function switchClient(clientId: string) {
    if (clientId === activeClientId) return setMenuOpen(false);
    setSwitching(true);
    const res = await fetch("/api/auth/active-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    setSwitching(false);
    setMenuOpen(false);
    if (!res.ok) return;
    // Home rather than the current URL, which points at a project the client we just
    // switched away from owns.
    router.push("/");
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4 px-4 sm:px-6 md:px-10 py-4 border-b-2 border-line2 sticky top-0 bg-bg/90 backdrop-blur-md z-20">
      <Link
        href="/"
        className="flex items-center gap-2.5 flex-none py-2.5 -my-2.5"
      >
        <div className="w-3.5 h-3.5 bg-accent flex-none" />
        <span className="font-black text-[15px]">BJUR</span>
        <span className="font-semibold tracking-[0.3em] text-[11px] text-muted">
          MEDIA
        </span>
      </Link>

      {/* Desktop/tablet: full inline actions */}
      <div className="ml-auto hidden sm:flex items-center gap-4">
        <ClientSwitcher
          memberships={memberships}
          activeClientId={activeClientId}
        />
        <ThemeToggle portal="client" />
        <Link
          href="/settings"
          className="flex items-center gap-3 hover:opacity-80"
        >
          {/* The switcher already names the client when there is a choice to make. */}
          {memberships.length < 2 && (
            <span className="text-[13px] text-muted">{clientName}</span>
          )}
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
          <IconMore className="text-2xl" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-60 bg-s2 border border-line2 z-40 bjfade">
              <div className="px-4 py-3 border-b border-line">
                <div className="text-[10px] text-dim uppercase tracking-wide font-semibold">
                  Signed in as
                </div>
                <div className="text-sm font-semibold truncate mt-0.5">
                  {clientName}
                </div>
              </div>
              {/* The desktop switcher is a dropdown; on a phone the menu is already
                  open, so the clients go straight in it rather than nesting a second
                  menu inside this one. */}
              {memberships.length > 1 && (
                <div className="border-b border-line">
                  <div className="px-4 pt-3 pb-1 text-[10px] text-dim uppercase tracking-wide font-semibold">
                    Your clients
                  </div>
                  {memberships.map((m) => (
                    <button
                      key={m.clientId}
                      onClick={() => switchClient(m.clientId)}
                      disabled={switching}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-s3 cursor-pointer disabled:opacity-50 ${
                        m.clientId === activeClientId
                          ? "text-text font-semibold"
                          : "text-muted"
                      }`}
                    >
                      {m.clientName}
                      {m.clientId === activeClientId ? " · viewing" : ""}
                    </button>
                  ))}
                </div>
              )}
              <div className="border-b border-line px-2 py-1">
                <ThemeToggle portal="client" />
              </div>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-sm text-text hover:bg-s3 border-b border-line"
              >
                Settings
              </Link>
              <button
                onClick={signOut}
                className="w-full text-left px-4 py-3 text-sm text-text hover:bg-s3 cursor-pointer"
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
