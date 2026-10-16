"use client";

import { useIsPhone } from "@/components/ui/useIsPhone";
import { useHeaderHeight } from "@/components/ui/useHeaderHeight";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { NavUnderline } from "@/components/ui/NavUnderline";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { initials } from "@/lib/initials";
import { IconMore } from "@/components/ui/Icon";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import type { ClientMembership } from "@/lib/auth";

export function ClientHeader({
  clientName,
  footageUploads = false,
  userName,
  memberships = [],
  activeClientId = null,
}: {
  clientName: string;
  /** The studio switches footage uploads on per client; off, the tab does not exist. */
  footageUploads?: boolean;
  userName: string;
  memberships?: ClientMembership[];
  activeClientId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useHeaderHeight<HTMLDivElement>();
  // Only mounted on a phone, so a desktop page holds one theme toggle, not two.
  const phone = useIsPhone();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div
      ref={headerRef}
      className="flex items-center gap-4 px-4 sm:px-6 md:px-10 py-4 border-b-2 border-line2 sticky top-0 bg-bg/90 backdrop-blur-md z-20"
    >
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

      {/* Projects always; uploading only where the studio has opened that door. Off, the
          tab is absent rather than present-and-refusing — a client should not be shown a
          way to send us things we are not expecting. */}
      <nav className="flex items-center gap-1 ml-2">
        <Link
          href="/"
          className={`relative px-3 py-2 min-h-11 sm:min-h-0 inline-flex items-center text-xs font-semibold uppercase tracking-wide transition-colors ${
            pathname === "/" ? "text-text" : "text-muted hover:text-text"
          }`}
        >
          Projects
          {pathname === "/" && <NavUnderline group="client" />}
        </Link>
        {footageUploads && (
          <Link
            href="/send"
            data-testid="nav-send"
            className={`relative px-3 py-2 min-h-11 sm:min-h-0 inline-flex items-center text-xs font-semibold uppercase tracking-wide transition-colors ${
              pathname.startsWith("/send") ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            Upload footage
            {pathname.startsWith("/send") && <NavUnderline group="client" />}
          </Link>
        )}
      </nav>

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
          className="w-11 h-11 -mr-1 grid place-items-center text-text cursor-pointer flex-none"
        >
          <IconMore className="text-2xl" />
        </button>
      </div>
      {/* A sheet from the bottom edge, not a dropdown off the corner: within thumb reach,
          44px rows, and it closes the way a phone sheet does. */}
      {phone && (
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} label="Menu">
        <div className="px-5 pb-3 border-b border-line">
          <div className="text-[10px] text-dim uppercase tracking-wide font-semibold">Signed in as</div>
          <div className="text-sm font-semibold truncate mt-0.5">{clientName}</div>
        </div>
        <ClientSwitcher
          variant="list"
          memberships={memberships}
          activeClientId={activeClientId}
          onSwitched={() => setMenuOpen(false)}
        />
        <div className="border-b border-line px-3 min-h-11 flex items-center">
          <ThemeToggle portal="client" />
        </div>
        <Link
          href="/settings"
          onClick={() => setMenuOpen(false)}
          className="flex items-center min-h-11 px-5 text-sm text-text active:bg-s3 border-b border-line transition-colors"
        >
          Settings
        </Link>
        <button
          onClick={signOut}
          className="w-full text-left flex items-center min-h-11 px-5 text-sm text-text active:bg-s3 cursor-pointer transition-colors"
        >
          Sign out
        </button>
      </BottomSheet>
      )}
    </div>
  );
}
