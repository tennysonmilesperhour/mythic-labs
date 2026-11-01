"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, today, type ProjectSummary, type TaskRef, type TimelineItem } from "@/lib/projectTypes";
import { projectHref, taskHref } from "@/lib/taskMap";
import { StatusDot } from "./ProjectBits";

type Item = { key: string; date: string; kind: "task" | "milestone" | "target"; title: string; sub: string; href: string; late: boolean; mine: boolean };

/** A month of due dates, milestone targets and project targets. */
export default function CalendarView({ dated, timeline, projects }: { dated: TaskRef[]; timeline: TimelineItem[]; projects: ProjectSummary[] }) {
  const day = today();
  const [month, setMonth] = useState(day.slice(0, 7));
  const ids = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const t of dated) {
      if (!ids.has(t.project_id)) continue;
      out.push({ key: `t-${t.id}`, date: t.due_date!, kind: "task", title: t.title, sub: `${t.project_name}${t.agent ? ` · @${t.agent}` : ""}`, href: taskHref(t.id), late: t.due_date! < day, mine: t.agent === "me" });
    }
    for (const m of timeline) {
      if (!ids.has(m.project_id) || m.done || !m.target_date) continue;
      out.push({ key: `m-${m.id}`, date: m.target_date, kind: "milestone", title: m.title, sub: m.project_name, href: projectHref(m.project_id, "plan"), late: m.target_date < day, mine: false });
    }
    for (const p of projects) {
      if (!p.target_date || p.status === "paused") continue;
      out.push({ key: `p-${p.id}`, date: p.target_date, kind: "target", title: `${p.name} target`, sub: "project", href: projectHref(p.id), late: p.target_date < day, mine: false });
    }
    return out;
  }, [dated, timeline, projects, ids, day]);

  const byDate = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [items]);

  const first = `${month}-01`;
  const firstDow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const start = addDays(first, -firstDow);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const label = new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const inMonth = items.filter((i) => i.date.startsWith(month));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-3">
          <button onClick={() => shift(-1)} className="font-mono text-[0.7rem] text-fg-dim hover:text-fg px-2" aria-label="Previous month">←</button>
          <h2 className="serif-display text-[1.6rem]">{label}</h2>
          <button onClick={() => shift(1)} className="font-mono text-[0.7rem] text-fg-dim hover:text-fg px-2" aria-label="Next month">→</button>
          {month !== day.slice(0, 7) ? (
            <button onClick={() => setMonth(day.slice(0, 7))} className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-accent hover:text-fg">today</button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 font-mono text-[0.58rem] text-fg-ghost">
          <span>{inMonth.filter((i) => i.kind === "task").length} tasks due</span>
          <span>◇ {inMonth.filter((i) => i.kind === "milestone").length} milestones</span>
          <span>★ {inMonth.filter((i) => i.kind === "target").length} targets</span>
          <a href="/api/calendar.ics" className="text-accent hover:text-fg" title="Subscribe from Google Calendar or Apple Calendar">calendar feed ↗</a>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-line border border-line">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-bg-warm/70 px-2 py-1 mono-label-dim">{d}</div>
        ))}
        {cells.map((date) => {
          const list = byDate.get(date) ?? [];
          const isToday = date === day;
          const other = !date.startsWith(month);
          return (
            <div key={date} className={`min-h-[6.5rem] p-1.5 ${other ? "bg-bg/40" : "bg-bg/85"} ${isToday ? "outline outline-1 outline-accent -outline-offset-1" : ""}`}>
              <div className={`font-mono text-[0.6rem] mb-1 tnum ${isToday ? "text-accent" : other ? "text-fg-ghost/60" : "text-fg-ghost"}`}>{Number(date.slice(8))}</div>
              <ul className="flex flex-col gap-0.5">
                {list.slice(0, 4).map((i) => (
                  <li key={i.key}>
                    <Link
                      href={i.href}
                      title={`${i.title} · ${i.sub}`}
                      className={`block truncate text-[0.68rem] leading-snug px-1 border-l-2 hover:text-accent ${
                        i.kind === "milestone" ? "border-accent text-fg" : i.kind === "target" ? "border-fg text-fg" : i.late ? "border-fg text-fg" : i.mine ? "border-accent-light text-fg" : "border-line text-fg-dim"
                      }`}
                    >
                      {i.kind === "milestone" ? "◇ " : i.kind === "target" ? "★ " : ""}
                      {i.title}
                    </Link>
                  </li>
                ))}
                {list.length > 4 ? <li className="font-mono text-[0.55rem] text-fg-ghost px-1">+{list.length - 4} more</li> : null}
              </ul>
            </div>
          );
        })}
      </div>
      {inMonth.length ? (
        <ul className="mt-6 flex flex-col">
          {inMonth
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((i) => (
              <li key={i.key}>
                <Link href={i.href} className="flex items-baseline gap-3 py-1.5 border-b border-line hover:text-accent text-[0.85rem]">
                  <span className={`font-mono text-[0.6rem] w-16 shrink-0 ${i.late ? "text-fg" : "text-fg-ghost"}`}>{new Date(`${i.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-accent w-16 shrink-0">{i.kind}</span>
                  <span className="flex-1 min-w-0 truncate">{i.title}</span>
                  <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0 flex items-center gap-1.5">
                    {projects.find((p) => p.name === i.sub.split(" · ")[0]) ? <StatusDot status={projects.find((p) => p.name === i.sub.split(" · ")[0])!.status} /> : null}
                    {i.sub}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-6 text-fg-ghost text-sm">Nothing is due this month.</p>
      )}
    </div>
  );
}
