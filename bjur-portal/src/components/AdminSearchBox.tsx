"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Group = { label: string; items: { title: string; sub: string; href: string }[] };

export function AdminSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Stale results are harmless here — isOpen already hides the dropdown once the
    // query is cleared, so there's nothing to reset synchronously.
    if (!query.trim()) return;
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json().catch(() => ({ groups: [] }));
      setGroups(data.groups ?? []);
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const isOpen = open && query.trim().length > 0;

  return (
    <div ref={boxRef} className="relative w-[300px]">
      <div className="flex items-center gap-2 bg-bg border border-line2 focus-within:border-accent px-3 py-2">
        <span className="text-dim text-sm">⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search clients, projects, files…"
          className="flex-1 bg-transparent border-0 text-text text-[13px] outline-none min-w-0"
        />
        {isOpen && (
          <span onClick={() => { setQuery(""); setOpen(false); }} className="cursor-pointer text-dim text-xs">
            ✕
          </span>
        )}
      </div>
      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] right-0 left-0 bg-s2 border border-line2 shadow-[0_18px_50px_rgba(0,0,0,.6)] z-40 max-h-[62vh] overflow-y-auto">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-3.5 pt-2.5 pb-1.5 text-[10px] tracking-wide uppercase text-muted font-bold">
                {g.label}
              </div>
              {g.items.map((it, i) => (
                <div
                  key={i}
                  onClick={() => {
                    router.push(it.href);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="cursor-pointer px-3.5 py-2.5 border-t border-line hover:bg-white/[0.04]"
                >
                  <div className="text-[13px] font-semibold truncate">{it.title}</div>
                  <div className="text-[11px] text-muted mt-0.5">{it.sub}</div>
                </div>
              ))}
            </div>
          ))}
          {groups.length === 0 && (
            <div className="px-3.5 py-6 text-[13px] text-muted text-center">No matches for &quot;{query}&quot;</div>
          )}
        </div>
      )}
    </div>
  );
}
