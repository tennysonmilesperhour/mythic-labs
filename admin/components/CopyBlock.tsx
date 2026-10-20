"use client";

import { useState } from "react";

export default function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "blocked">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("blocked");
    }
    setTimeout(() => setCopied("idle"), 1800);
  };

  return (
    <div className="relative group">
      <pre className="bg-bg/80 border border-line px-4 py-3 pr-20 font-mono text-[0.72rem] leading-[1.7] text-fg whitespace-pre-wrap [overflow-wrap:anywhere]">
        {text}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 font-mono text-[0.55rem] tracking-[0.2em] uppercase px-2 py-1 border border-line bg-bg text-fg-dim hover:text-fg hover:border-fg-dim"
        style={{
          transition:
            "color var(--motion-base) var(--ease-mythic), border-color var(--motion-base) var(--ease-mythic)",
        }}
      >
        {copied === "done" ? "Copied" : copied === "blocked" ? "Blocked" : "Copy"}
      </button>
    </div>
  );
}
