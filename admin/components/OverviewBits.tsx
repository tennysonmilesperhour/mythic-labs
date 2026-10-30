"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { relTime } from "@/lib/projectTypes";

/** "Loaded 3m ago" with the exact time on hover, plus a button that re-reads every source. */
export function Freshness({ loadedAt }: { loadedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const exact = new Date(loadedAt).toLocaleString();
  return (
    <div className="flex items-center gap-3 font-mono text-[0.62rem] text-fg-ghost">
      <span title={`Data read at ${exact}`} suppressHydrationWarning>
        {pending ? "Reloading…" : `Data loaded ${relTime(loadedAt) || "just now"}`}
      </span>
      <button
        onClick={() => start(() => router.refresh())}
        disabled={pending}
        title="Re-read the project store, the marketplace and the repo list"
        className="border border-line px-2.5 py-1 uppercase tracking-[0.18em] text-fg-dim hover:text-fg disabled:opacity-50"
      >
        Reload data
      </button>
    </div>
  );
}
