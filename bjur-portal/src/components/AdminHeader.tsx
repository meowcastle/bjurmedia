"use client";

import { useHeaderHeight } from "@/components/ui/useHeaderHeight";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useIsPhone } from "@/components/ui/useIsPhone";
import { usePresence } from "@/components/ui/usePresence";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminSearchBox } from "@/components/AdminSearchBox";
import { Seal } from "@/components/ui/Seal";

const TABS = [
  { href: "/admin", label: "today" },
  { href: "/admin/clients", label: "clients" },
  { href: "/admin/pipeline", label: "pipeline" },
  { href: "/admin/inbox", label: "inbox" },
  { href: "/admin/reports", label: "reports" },
  { href: "/admin/integrations", label: "integrations" },
];

/**
 * The two screens that are real but occasional. Neither belongs on a bar you read every
 * morning: Team is where staff logins are added, which happens a few times a year, and
 * Library registers footage already sitting on the NAS into a project — reached until now
 * only from a contextual link on Media, which made it findable by memory and nothing else.
 *
 * They sit in the account menu rather than a second control beside it. A hamburger next to
 * an avatar that already opens a menu is two doors into one room.
 */
const MENU_LINKS = [
  { href: "/admin/team", label: "Team", hint: "Staff logins for the portal" },
  { href: "/admin/library", label: "Library", hint: "Register footage already on the NAS" },
];

export function AdminHeader({ userName }: { userName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = usePresence(menuOpen);
  const phone = useIsPhone();
  const headerRef = useHeaderHeight<HTMLDivElement>();
  const menuRef = useRef<HTMLDivElement>(null);

  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  useEffect(() => {
    // On a phone the menu is a portalled sheet with its own backdrop; a tap inside it is
    // "outside" this ref and would close the menu before the tap reached its item.
    if (phone) return;
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
  }, [phone]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  // One set of items, two containers: a sheet from the bottom edge on a phone, the
  // dropdown everywhere else. On a phone the centre links have no room, so they lead it.
  const menuItems = (
    <>
    {phone && TABS.map((tab) => (
      <Link
        key={tab.href}
        role="menuitem"
        href={tab.href}
        onClick={() => setMenuOpen(false)}
        className="block px-4 py-3 border-b border-line text-sm text-body hover:text-text hover:bg-s3"
      >
        {tab.label}
      </Link>
    ))}
    {MENU_LINKS.map((item) => (
      <Link
        key={item.href}
        role="menuitem"
        href={item.href}
        // Closed here rather than in an effect on pathname: setState inside an
        // effect is a cascading render, and the click is the actual event — the
        // route changing is just its consequence.
        onClick={() => setMenuOpen(false)}
        className="block px-4 py-3 border-b border-line hover:bg-s3 group"
      >
        <span className="block text-[13px] font-semibold text-muted group-hover:text-text">
          {item.label}
        </span>
        {/* Neither name says what the screen does — "Library" especially reads
            like a media browser when it is an ingest tool. One line each. */}
        <span className="block text-[11px] text-muted/70 mt-0.5">{item.hint}</span>
      </Link>
    ))}
    <div className="px-4 py-3 border-b border-line text-[13px] font-semibold truncate">
      {userName}
    </div>
    <button
      role="menuitem"
      onClick={signOut}
      className="w-full text-left px-4 py-3 text-[13px] text-muted hover:text-text hover:bg-s3 cursor-pointer"
    >
      Sign out
    </button>
    </>
  );

  return (
    <div
      ref={headerRef}
      className="print:hidden sticky top-0 z-20 bg-bg/90 backdrop-blur-md px-4 md:px-10 py-4 md:py-5"
    >
      {/* v13 (PortalAdmin13): the seal with "Studio" over "Client portal admin", lowercase
          links centred, then search (⌘K), the theme toggle and the initials. */}
      <nav className="bj-nav" aria-label="Studio">
        <Link href="/admin" className="bj-brand">
          <Seal className="bj-seal" />
          <span className="who">
            <span className="bj-mono ink">Studio</span>
            <span className="bj-mono">Client portal admin</span>
          </span>
        </Link>
        <ul className="bj-links">
          {TABS.map((tab) => {
            const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
            return (
              <li key={tab.href}>
                <Link href={tab.href} className={active ? "on" : undefined} aria-current={active ? "page" : undefined}>
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="r">
          {!phone && <AdminSearchBox />}
          {!phone && <ThemeToggle portal="admin" />}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Menu for ${userName}`}
              // 44px to the finger, 30px to the eye.
              className="group w-11 h-11 -m-[7px] grid place-items-center cursor-pointer"
            >
              <span className="bj-me group-hover:shadow-[inset_0_0_0_1px_var(--text)]">{initials}</span>
            </button>
            {!phone && menu.mounted && (
              <div
                role="menu"
                data-testid="admin-account-menu"
                className={`absolute right-0 top-[calc(100%+8px)] min-w-[232px] bg-s2 border border-line shadow-2 z-40 [border-radius:3px!important] overflow-hidden ${menu.leaving ? "bj-pop-out pointer-events-none" : "bj-pop-in"}`}
              >
                {menuItems}
              </div>
            )}
          </div>
        </div>
      </nav>
      {phone && (
        <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} label={`Menu for ${userName}`}>
          <div role="menu" data-testid="admin-account-menu">
            {menuItems}
            <div className="px-3 min-h-11 flex items-center border-t border-line"><ThemeToggle portal="admin" /></div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
