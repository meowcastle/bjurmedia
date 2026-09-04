"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminSearchBox } from "@/components/AdminSearchBox";

const TABS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/team", label: "Team" },
];

export function AdminHeader({ userName }: { userName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="print:hidden flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-10 py-3 md:py-4 border-b-2 border-line2 sticky top-0 bg-bg/90 backdrop-blur-md z-20">
      <Link href="/admin" className="flex items-center gap-2.5 flex-none py-2.5 -my-2.5">
        <div className="w-3.5 h-3.5 bg-accent" />
        <span className="font-black text-[15px]">BJUR</span>
        <span className="font-semibold tracking-[0.3em] text-[11px] text-muted">MEDIA</span>
      </Link>
      <div className="w-px h-5 bg-line2 hidden lg:block" />
      <span className="text-xs tracking-[0.14em] uppercase text-muted font-semibold hidden lg:inline">Admin</span>
      {/* Below md the tabs get their own full-width row and scroll sideways: sharing a
          line with the fixed-width search box left them clipped, and a clipped tab is an
          unreachable page. */}
      <nav className="order-last w-full -mx-1 px-1 flex items-center gap-1 overflow-x-auto md:order-none md:w-auto md:mx-0 md:px-0 md:ml-4 md:min-w-0 md:flex-1">
        {TABS.map((tab) => {
          const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide flex-none whitespace-nowrap ${
                active ? "text-text border-b-2 border-accent" : "text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-4 flex-none">
        <AdminSearchBox />

        {/* §8: the name and a permanent "Sign out" ate width the tabs needed, and the
            name was hidden below lg anyway — so on a laptop the header offered a
            sign-out button belonging to nobody in particular. */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Account menu for ${userName}`}
            className="w-[30px] h-[30px] grid place-items-center bg-s3 border border-line2 hover:border-text text-[11px] font-black cursor-pointer"
          >
            {initials}
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] min-w-[180px] bg-s2 border border-line2 shadow-[0_18px_50px_rgba(0,0,0,.6)] z-40"
            >
              <div className="px-4 py-3 border-b border-line text-[13px] font-semibold truncate">
                {userName}
              </div>
              <button
                role="menuitem"
                onClick={signOut}
                className="w-full text-left px-4 py-3 text-[13px] text-muted hover:text-text hover:bg-white/[0.04] cursor-pointer"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
