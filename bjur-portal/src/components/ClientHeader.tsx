"use client";

import { useIsPhone } from "@/components/ui/useIsPhone";
import { useHeaderHeight } from "@/components/ui/useHeaderHeight";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { usePresence } from "@/components/ui/usePresence";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { initials } from "@/lib/initials";
import { IconMore } from "@/components/ui/Icon";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import { Seal } from "@/components/ui/Seal";
import type { ClientMembership } from "@/lib/auth";

/**
 * v13 header (PortalProjects13): the seal × the client's logo with "Client portal" and
 * their name, lowercase links in the middle, the theme toggle and the initials on the
 * right. The initials open the account menu (switch client, settings, sign out). Under
 * 900px the links join that menu, which becomes a sheet from the bottom edge.
 */
export function ClientHeader({
  clientName,
  logoUrl = null,
  logoColor = null,
  footageUploads = false,
  userName,
  memberships = [],
  activeClientId = null,
}: {
  clientName: string;
  logoUrl?: string | null;
  /** The ground behind the initials when there's no logo; never an action colour. */
  logoColor?: string | null;
  /** The studio switches footage uploads on per client; off, the link does not exist. */
  footageUploads?: boolean;
  userName: string;
  memberships?: ClientMembership[];
  activeClientId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = usePresence(menuOpen);
  const headerRef = useHeaderHeight<HTMLDivElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();

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
    router.push("/login");
    router.refresh();
  }

  // Projects always; footage only where the studio has opened that door. Off, the link is
  // absent rather than present-and-refusing.
  const links = [
    { href: "/", label: "projects", on: pathname === "/" || pathname.startsWith("/p/"), testId: undefined },
    ...(footageUploads ? [{ href: "/send", label: "send footage", on: pathname.startsWith("/send"), testId: "nav-send" }] : []),
    { href: "/settings", label: "settings", on: pathname.startsWith("/settings"), testId: undefined },
  ];

  const item = "block w-full text-left px-4 py-3 min-h-11 text-sm text-body hover:text-text hover:bg-s3 border-b border-line cursor-pointer";
  const menuItems = (
    <>
      <div className="px-4 py-3 border-b border-line">
        <div className="bj-mono">Signed in as</div>
        <div className="text-sm font-semibold truncate mt-1">{userName}</div>
      </div>
      {phone && links.map((l) => (
        <Link key={l.href} role="menuitem" href={l.href} data-testid={l.testId} onClick={() => setMenuOpen(false)} className={item}>
          {/* Menu rows read as sentence case, like Settings and Sign out. */}
          {l.label[0].toUpperCase() + l.label.slice(1)}
        </Link>
      ))}
      {phone && <ClientSwitcher variant="list" memberships={memberships} activeClientId={activeClientId} onSwitched={() => setMenuOpen(false)} />}
      {phone && <div className="px-3 min-h-11 flex items-center border-b border-line"><ThemeToggle portal="client" /></div>}
      {!phone && <Link role="menuitem" href="/settings" onClick={() => setMenuOpen(false)} className={item}>Settings</Link>}
      <button role="menuitem" onClick={signOut} className={`${item} border-b-0`}>Sign out</button>
    </>
  );

  return (
    <div ref={headerRef} className="sticky top-0 z-20 bg-bg/90 backdrop-blur-md px-4 md:px-10 py-4 md:py-5">
      <nav className="bj-nav" aria-label="Primary">
        <Link href="/" className="bj-brand" aria-label={`${clientName}, client portal home`}>
          <Seal className="bj-seal" />
          <span className="x" aria-hidden="true">&times;</span>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="bj-lg" src={logoUrl} alt="" style={{ width: 34, height: 34 }} />
          ) : (
            <span className="bj-av" style={{ width: 34, height: 34, background: logoColor ?? "#8C887C" }} aria-hidden="true">
              {initials(clientName)}
            </span>
          )}
          <span className="who">
            <span className="bj-mono ink">Client portal</span>
            <span className="bj-mono">{clientName}</span>
          </span>
        </Link>

        <ul className="bj-links">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} data-testid={l.testId} className={l.on ? "on" : undefined} aria-current={l.on ? "page" : undefined}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="r">
          {/* Renders nothing for a single-client seat, which is almost everyone. */}
          {!phone && <ClientSwitcher memberships={memberships} activeClientId={activeClientId} />}
          {!phone && <ThemeToggle portal="client" />}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={phone ? "Open menu" : `Menu for ${userName}`}
              className="group grid place-items-center w-11 h-11 -m-[7px] cursor-pointer"
            >
              {phone ? <IconMore className="text-2xl" /> : <span className="bj-me group-hover:shadow-[inset_0_0_0_1px_var(--text)]">{initials(userName)}</span>}
            </button>
            {!phone && menu.mounted && (
              <div
                role="menu"
                className={`absolute right-0 top-[calc(100%+8px)] min-w-[232px] bg-s2 border border-line shadow-2 z-40 [border-radius:3px!important] overflow-hidden ${menu.leaving ? "bj-pop-out pointer-events-none" : "bj-pop-in"}`}
              >
                {menuItems}
              </div>
            )}
          </div>
        </div>
      </nav>
      {phone && (
        <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} label="Menu">
          <div role="menu">{menuItems}</div>
        </BottomSheet>
      )}
    </div>
  );
}
