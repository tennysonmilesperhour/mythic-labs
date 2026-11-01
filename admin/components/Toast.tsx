"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ToastInput = {
  message: string;
  tone?: "info" | "success" | "error";
  /** One optional action, e.g. Undo. Dismisses the toast when run. */
  action?: { label: string; onClick: () => void | Promise<void> };
  /** Milliseconds before it fades. Errors and toasts with actions wait longer. */
  ttl?: number;
};

type Toast = ToastInput & { id: number };

type Api = {
  toast: (t: ToastInput | string) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<Api | null>(null);

export function useToast(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast needs <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback((input: ToastInput | string) => {
    const t: Toast = { id: ++seq.current, tone: "info", ...(typeof input === "string" ? { message: input } : input) };
    setItems((xs) => [...xs.slice(-3), t]);
  }, []);
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]" aria-live="polite">
        {items.map((t) => (
          <ToastView key={t.id} t={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ t, onDone }: { t: Toast; onDone: () => void }) {
  const ttl = t.ttl ?? (t.action ? 8000 : t.tone === "error" ? 7000 : 3500);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = setTimeout(onDone, ttl);
    return () => clearTimeout(h);
  }, [ttl, onDone]);
  const mark = t.tone === "error" ? "✕" : t.tone === "success" ? "✓" : "·";
  return (
    <div
      role="status"
      className={`glass border px-4 py-3 flex items-start gap-3 shadow-[var(--shadow-lifted)] ${
        t.tone === "error" ? "border-fg" : t.tone === "success" ? "border-accent" : "border-line"
      }`}
    >
      <span className={`font-mono text-[0.7rem] mt-0.5 ${t.tone === "error" ? "text-fg" : "text-accent"}`}>{mark}</span>
      <span className="flex-1 min-w-0 text-[0.85rem] text-fg leading-snug break-words">{t.message}</span>
      {t.action ? (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await t.action!.onClick();
            } finally {
              onDone();
            }
          }}
          className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-accent hover:text-fg disabled:opacity-50 shrink-0"
        >
          {busy ? "…" : t.action.label}
        </button>
      ) : null}
      <button onClick={onDone} aria-label="Dismiss" className="font-mono text-[0.7rem] text-fg-ghost hover:text-fg shrink-0">
        ×
      </button>
    </div>
  );
}
