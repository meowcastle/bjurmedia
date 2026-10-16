"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Portal } from "@/components/ui/Portal";

/**
 * The confirmation strip from the handoff's global section, now stacked (PORTAL-POLISH §2).
 *
 * Rendered above dialogs rather than inside them: the thing worth confirming usually
 * happens as a dialog closes, so a toast owned by the dialog would unmount with the
 * action it was reporting.
 *
 * Each <Toast> posts into one shared stack that <Toaster> (mounted once, at the root)
 * draws: up to three at a time, newest at the bottom, each on its own timer. Two quick
 * saves used to replace each other mid-read; now both are seen. Call sites keep the same
 * `message` / `onDone` contract they had.
 */

type Item = {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  raised: boolean;
  leaving: boolean;
};

const MAX = 3;
const EXIT_MS = 120;
let items: Item[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function remove(id: number) {
  const item = items.find((i) => i.id === id);
  if (!item || item.leaving) return;
  items = items.map((i) => (i.id === id ? { ...i, leaving: true } : i));
  emit();
  setTimeout(() => {
    items = items.filter((i) => i.id !== id);
    emit();
  }, EXIT_MS);
}

/**
 * Adds a toast that leaves on its own timer. The returned function only stops it from
 * reporting back: a toast already on screen finishes its time even if its message moves
 * on or the component that raised it unmounts — two quick saves stack instead of the
 * second wiping the first, and a dialog's "Saved" outlives the dialog.
 */
function push(item: Omit<Item, "id" | "leaving">, ms: number, onGone: () => void) {
  const id = nextId++;
  let current = true;
  items = [...items, { ...item, id, leaving: false }];
  // Past three, the oldest steps aside rather than the stack climbing the screen.
  const live = items.filter((i) => !i.leaving);
  if (live.length > MAX) remove(live[0].id);
  emit();
  setTimeout(() => {
    remove(id);
    if (current) onGone();
  }, ms);
  return () => {
    current = false;
  };
}

export function Toast({
  message,
  onDone,
  /** Lifts clear of the client-side selection bar when one is up. */
  raised = false,
  action,
}: {
  message: string | null;
  onDone: () => void;
  raised?: boolean;
  /** One follow-up, such as UNDO. The strip stays up longer so there is time to reach it. */
  action?: { label: string; onClick: () => void };
}) {
  // Read through refs so the effect below re-runs only when the message itself changes.
  const latest = useRef({ onDone, action, raised });
  useEffect(() => {
    latest.current = { onDone, action, raised };
  });

  useEffect(() => {
    if (!message) return;
    const { action: act, raised: up } = latest.current;
    const done = () => latest.current.onDone();
    return push(
      {
        message,
        raised: up,
        action: act && {
          label: act.label,
          onClick: () => {
            act.onClick();
            done();
          },
        },
      },
      act ? 5000 : 2200,
      done,
    );
  }, [message]);

  return null;
}

/** Draws the stack. Mounted once, at the root. */
export function Toaster() {
  const stack = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
  if (stack.length === 0) return null;
  const raised = stack.some((i) => i.raised && !i.leaving);
  return (
    <Portal>
      <div
        className={`fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none ${
          raised
            ? "bottom-[calc(100px+env(safe-area-inset-bottom))]"
            : "bottom-[calc(2rem+env(safe-area-inset-bottom))]"
        }`}
      >
        {stack.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            data-testid="toast"
            className={`pointer-events-auto bg-text text-bg text-[13px] font-bold px-[18px] py-3 shadow-2 whitespace-nowrap ${
              t.leaving ? "bj-stack-out" : "bj-stack-in"
            }`}
          >
            {t.message}
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  remove(t.id);
                }}
                className="ml-4 underline underline-offset-2 cursor-pointer tracking-[.08em]"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Portal>
  );
}
