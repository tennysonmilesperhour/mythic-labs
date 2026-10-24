"use client";

import { useState } from "react";
import {
  STATUSES,
  STATUS_META,
  type Priority,
  type ProjectStatus,
} from "@/lib/projectTypes";
import { GlyphClose } from "./Glyphs";

const T = (props: string) => ({
  transition: props
    .split(",")
    .map((p) => `${p.trim()} var(--motion-base) var(--ease-mythic)`)
    .join(", "),
});

export async function api<R = Record<string, unknown>>(
  url: string,
  method: string,
  data?: unknown
): Promise<R> {
  const res = await fetch(url, {
    method,
    headers: data ? { "content-type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json as R;
}

/** Four-way segmented switch: active / building / planned / paused. */
export function StatusToggle({
  value,
  onChange,
  size = "md",
}: {
  value: ProjectStatus;
  onChange: (s: ProjectStatus) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex gap-px bg-line border border-line" role="radiogroup">
      {STATUSES.map((s) => {
        const on = s === value;
        return (
          <button
            key={s}
            role="radio"
            aria-checked={on}
            title={STATUS_META[s].hint}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!on) onChange(s);
            }}
            className={`flex items-center gap-1.5 font-mono uppercase ${
              size === "sm"
                ? "text-[0.52rem] tracking-[0.14em] px-2 py-1"
                : "text-[0.6rem] tracking-[0.2em] px-3 py-2"
            } ${on ? "bg-fg text-bg" : "bg-bg/80 text-fg-ghost hover:text-fg"}`}
            style={T("color, background-color")}
          >
            <StatusDot status={s} />
            {size === "md" || on ? STATUS_META[s].label : null}
          </button>
        );
      })}
    </div>
  );
}

export function StatusDot({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
        status === "active" ? "pulse-dot" : ""
      }`}
      style={{ background: STATUS_META[status].dot }}
      aria-hidden="true"
    />
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-[3px] bg-line overflow-hidden">
        <div
          className="h-full bg-accent"
          style={{ width: `${pct}%`, transition: "width var(--motion-slow) var(--ease-mythic)" }}
        />
      </div>
      <span className="font-mono text-[0.6rem] text-fg-ghost tnum shrink-0">
        {done}/{total}
      </span>
    </div>
  );
}

export function Chip({
  children,
  tone = "dim",
  onRemove,
  title,
}: {
  children: React.ReactNode;
  tone?: "dim" | "accent" | "solid";
  onRemove?: () => void;
  title?: string;
}) {
  const cls =
    tone === "accent"
      ? "border-accent text-fg bg-[rgba(139,115,85,0.08)]"
      : tone === "solid"
        ? "border-fg bg-fg text-bg"
        : "border-line text-fg-dim bg-bg/70";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 font-mono text-[0.6rem] tracking-[0.08em] px-2 py-0.5 border ${cls}`}
    >
      {children}
      {onRemove ? (
        <button onClick={onRemove} className="opacity-50 hover:opacity-100" aria-label="Remove">
          <GlyphClose size={9} />
        </button>
      ) : null}
    </span>
  );
}

export const PRIORITY_MARK: Record<Priority, string> = {
  critical: "!!!",
  high: "!!",
  medium: "!",
  low: "·",
};

/** Chips plus a free-text input with suggestions. Enter or comma adds. */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  prefix,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  prefix?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = `tags-${placeholder?.replace(/\W/g, "") || "x"}`;
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "");
    if (!v || value.includes(v)) return setDraft("");
    onChange([...value, v]);
    setDraft("");
  };
  const unused = suggestions.filter((s) => !value.includes(s));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 items-center border border-line bg-bg/70 px-2 py-1.5 focus-within:border-accent" style={T("border-color")}>
        {value.map((v) => (
          <Chip key={v} tone="accent" onRemove={() => onChange(value.filter((x) => x !== v))}>
            {prefix}
            {v}
          </Chip>
        ))}
        <input
          list={listId}
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={placeholder}
          className="flex-1 min-w-[8rem] bg-transparent outline-none font-mono text-xs text-fg placeholder:text-fg-ghost py-0.5"
        />
        <datalist id={listId}>
          {unused.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {unused.length ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {unused.slice(0, 12).map((s) => (
            <button
              key={s}
              onClick={() => onChange([...value, s])}
              className="font-mono text-[0.58rem] px-1.5 py-0.5 text-fg-ghost hover:text-accent border border-transparent hover:border-line"
              style={T("color, border-color")}
            >
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Text that turns into an input on click; commits on blur or Enter. */
export function InlineText({
  value,
  onSave,
  className = "",
  placeholder = "—",
  multiline = false,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };
  if (!editing) {
    return (
      <span
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`cursor-text hover:bg-[rgba(139,115,85,0.06)] ${value ? "" : "text-fg-ghost"} ${
          multiline ? "whitespace-pre-wrap block" : ""
        } ${className}`}
        title="Click to edit"
      >
        {value || placeholder}
      </span>
    );
  }
  const shared = {
    autoFocus: true,
    value: draft,
    onBlur: commit,
    className: `w-full bg-bg/80 border border-accent outline-none px-1 ${className}`,
  };
  return multiline ? (
    <textarea
      {...shared}
      rows={Math.max(3, draft.split("\n").length)}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
      }}
    />
  ) : (
    <input
      {...shared}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

export const inputBase =
  "bg-bg/70 border border-line px-3 py-2 font-mono text-xs text-fg placeholder:text-fg-ghost focus:outline-none focus:border-accent";

export const inputCls = `${inputBase} w-full`;

export const btnPrimary =
  "lift-on-hover font-mono text-[0.62rem] tracking-[0.22em] uppercase px-4 py-2 bg-fg text-bg disabled:opacity-40";

export const btnGhost =
  "font-mono text-[0.6rem] tracking-[0.2em] uppercase px-3 py-1.5 border border-line text-fg-dim hover:text-fg hover:border-fg-dim disabled:opacity-40";
