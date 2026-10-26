"use client";

import { useEffect } from "react";

/** Counts this project as viewed once per tab session (see /api/client/projects/[id]/view). */
export function CountView({ projectId }: { projectId: string }) {
  useEffect(() => {
    const key = `viewed:${projectId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    void fetch(`/api/client/projects/${projectId}/view`, { method: "POST" }).catch(() => {});
  }, [projectId]);
  return null;
}
