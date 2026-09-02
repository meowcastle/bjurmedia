"use client";

import Link from "next/link";
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

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="print:hidden flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-10 py-3 md:py-4 border-b-2 border-line2 sticky top-0 bg-bg/90 backdrop-blur-md z-20">
      <Link href="/admin" className="flex items-center gap-2.5 flex-none">
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
        <span className="text-[13px] text-muted hidden lg:inline">{userName}</span>
        <button
          onClick={signOut}
          className="text-xs font-semibold text-muted hover:text-text px-1.5 py-1.5 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
