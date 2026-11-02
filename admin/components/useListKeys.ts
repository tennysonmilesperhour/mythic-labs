"use client";

import { useCallback, useEffect, useState } from "react";
import { chordArmed } from "./chord";

/**
 * j/k moves a cursor through a list; other single keys fire handlers for the
 * item under the cursor. Keys are off while a field has focus, an overlay is
 * open, or a g-chord is armed, and Enter on a focused button or link is left
 * to the browser. Holding an action key down fires it once.
 */
export function useListKeys<T>(
  items: T[],
  handlers: Partial<Record<string, (item: T, index: number) => void>>,
  opts: { enabled?: boolean } = {}
) {
  const [cursor, setCursor] = useState(0);
  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (cursor > items.length - 1) setCursor(Math.max(0, items.length - 1));
  }, [items.length, cursor]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (chordArmed()) return;
      const nav = e.key === "j" || e.key === "k" || e.key === "ArrowDown" || e.key === "ArrowUp";
      if (!nav && e.repeat) return;
      if ((e.key === "Enter" || e.key === " ") && (tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || el?.getAttribute("role") === "button")) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        if (!items.length) return;
        e.preventDefault();
        setCursor((c) => Math.min(items.length - 1, c + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else {
        const fn = handlers[e.key];
        if (fn && items[cursor]) {
          e.preventDefault();
          fn(items[cursor], cursor);
        }
      }
    },
    [enabled, items, cursor, handlers]
  );

  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-cursor="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return { cursor, setCursor };
}
