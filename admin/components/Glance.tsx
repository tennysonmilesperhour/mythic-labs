"use client";

import Link from "next/link";
import { useState } from "react";
import {
  dueLabel,
  isOverdue,
  relTime,
  type AttentionItem,
  type Severity,
  type TaskRef,
} from "@/lib/projectTypes";
import { StatusDot } from "./ProjectBits";

const SEVERITY_MARK: Record<Severity, { mark: string; cls: string; label: string }> = {
  high: { mark: "■", cls: "text-fg", label: "needs you" },
  medium: { mark: "◆", cls: "text-accent", label: "watch" },
  low: { mark: "·", cls: "text-fg-ghost", label: "tidy" },
};

/** Ranked flags: blocked, overdue, stalled, undecided, quiet. */
export function AttentionList({
  items,
  limit = 8,
  empty,
  hideProject = false,
}: {
  items: AttentionItem[];
  limit?: number;
  empty: string;
  hideProject?: boolean;
}) {
  const [all, setAll] = useState(false);
  if (!items.length) {
    return <p className="text-fg-ghost text-sm border border-dashed border-line px-4 py-5">{empty}</p>;
  }
  const shown = all ? items : items.slice(0, limit);
  return (
    <div className="border border-line bg-bg/85">
      <ul className="divide-y divide-[rgba(26,24,20,0.06)]">
        {shown.map((a) => {
          const sev = SEVERITY_MARK[a.severity];
          return (
            <li key={a.key}>
              <Link
                href={a.href ?? `/projects/${a.project_id}${a.task_id ? `?task=${a.task_id}` : ""}`}
                className="flex items-baseline gap-3 px-4 py-2.5 hover:bg-[rgba(139,115,85,0.05)]"
              >
                <span className={`font-mono text-[0.6rem] w-3 shrink-0 ${sev.cls}`} title={sev.label}>
                  {sev.mark}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[0.88rem] text-fg">{a.title}</span>
                  <span className="block font-mono text-[0.58rem] text-fg-ghost truncate">
                    {hideProject || !a.project_name ? "" : `${a.project_name} · `}
                    {a.detail}
                  </span>
                </span>
                <span className={`font-mono text-[0.52rem] uppercase tracking-[0.18em] shrink-0 ${sev.cls}`}>
                  {sev.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length > limit ? (
        <button
          onClick={() => setAll((v) => !v)}
          className="w-full border-t border-line py-2 font-mono text-[0.58rem] tracking-[0.2em] uppercase text-fg-dim hover:text-fg"
        >
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      ) : null}
    </div>
  );
}

/** Compact cross-project task list (in progress, due soon). */
export function TaskRefList({
  tasks,
  empty,
  show,
  limit = 6,
}: {
  tasks: TaskRef[];
  empty: string;
  show: "since" | "due";
  limit?: number;
}) {
  if (!tasks.length) return <p className="text-fg-ghost text-sm">{empty}</p>;
  return (
    <ul className="flex flex-col">
      {tasks.slice(0, limit).map((t) => {
        const late = isOverdue(t.due_date, t.status === "done");
        return (
          <li key={t.id}>
            <Link
              href={`/projects/${t.project_id}?task=${t.id}`}
              className="flex items-baseline gap-3 py-1.5 border-b border-line hover:text-accent"
            >
              <StatusDot status={t.project_status} />
              <span className="flex-1 min-w-0 truncate text-[0.85rem]">
                {t.title}
                <span className="font-mono text-[0.58rem] text-fg-ghost"> · {t.project_name}</span>
              </span>
              {t.agent ? <span className="font-mono text-[0.58rem] text-accent shrink-0">@{t.agent}</span> : null}
              <span className={`font-mono text-[0.58rem] shrink-0 w-16 text-right ${late ? "text-fg" : "text-fg-ghost"}`}>
                {show === "due" ? dueLabel(t.due_date) : relTime(t.claimed_at ?? t.updated_at)}
              </span>
            </Link>
          </li>
        );
      })}
      {tasks.length > limit ? (
        <li className="font-mono text-[0.58rem] text-fg-ghost pt-2">+ {tasks.length - limit} more</li>
      ) : null}
    </ul>
  );
}
