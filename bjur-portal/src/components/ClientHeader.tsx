"use client";

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

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4 px-10 py-4 border-b-2 border-line2 sticky top-0 bg-bg/90 backdrop-blur-md z-20">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="w-3.5 h-3.5 bg-accent" />
        <span className="font-black text-[15px]">BJUR</span>
        <span className="font-semibold tracking-[0.3em] text-[11px] text-muted">MEDIA</span>
      </Link>
      <div className="w-px h-5 bg-line2" />
      <span className="text-xs tracking-[0.14em] uppercase text-muted font-semibold">
        Client Portal
      </span>
      <div className="ml-auto flex items-center gap-4">
        <Link href="/settings" className="flex items-center gap-3 hover:opacity-80">
          <span className="text-[13px] text-muted">{clientName}</span>
          <div className="w-[30px] h-[30px] bg-s3 grid place-items-center text-xs font-bold">
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
    </div>
  );
}
