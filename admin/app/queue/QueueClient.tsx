"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ESTIMATES,
  LABEL_PRESETS,
  PRIORITIES,
  PRIORITY_RANK,
  RECURRENCES,
  RECURRENCE_META,
  STATUS_META,
  TASK_STATUSES,
  addDays,
  daysFromNow,
  dueLabel,
  fmtDate,
  isOverdue,
  relTime,
  today,
  type Priority,
  type ProjectStatus,
  type Task,
  type TaskStatus,
} from "@/lib/projectTypes";
import { ME, facetHref, projectHref, taskHref } from "@/lib/taskMap";
import { Chip, InlineText, PRIORITY_MARK, StatusDot, TagInput, api, btnGhost, btnPrimary, inputBase } from "@/components/ProjectBits";
import SubLink from "@/components/SubLink";
import { useToast } from "@/components/Toast";
import { useListKeys } from "@/components/useListKeys";
import { invalidateIndex } from "@/components/CommandLayer";

export type Row = Task & {
  project_name: string;
  project_status: ProjectStatus;
  milestone_title: string | null;
  path: string;
  ready: boolean;
  waiting: string[];
  subtasks: number;
  subtasks_done: number;
  mine: boolean;
  thread: number;
};

export type QueueProject = { id: string; name: string; status: ProjectStatus; agents: string[]; milestones: Array<{ id: string; title: string; done: boolean }> };

type Filters = {
  status: "open" | TaskStatus | "all";
  project: string;
  agent: string;
  priority: string;
  label: string;
  ready: boolean;
  overdue: boolean;
  due: "" | "today" | "week";
  mine: boolean;
  unassigned: boolean;
  q: string;
  group: "project" | "milestone" | "agent" | "priority" | "status" | "due" | "none";
  sort: "priority" | "due" | "updated" | "created" | "title" | "estimate";
};

const DEFAULTS: Filters = { status: "open", project: "", agent: "", priority: "", label: "", ready: false, overdue: false, due: "", mine: false, unassigned: false, q: "", group: "project", sort: "priority" };

const PRESETS: Array<{ label: string; patch: Partial<Filters>; key?: string }> = [
  { label: "Open", patch: {} },
  { label: "Ready", patch: { ready: true } },
  { label: "In progress", patch: { status: "doing" } },
  { label: "Blocked", patch: { status: "blocked" } },
  { label: "Overdue", patch: { overdue: true } },
  { label: "Due this week", patch: { due: "week" } },
  { label: "Mine", patch: { mine: true } },
  { label: "Unassigned", patch: { unassigned: true } },
  { label: "Done", patch: { status: "done", sort: "updated", group: "none" } },
];

function fromParams(p: Record<string, string | undefined>): Filters {
  const f: Filters = { ...DEFAULTS };
  if (p.status && ["open", "all", ...TASK_STATUSES].includes(p.status)) f.status = p.status as Filters["status"];
  f.project = p.project ?? "";
  f.agent = p.agent ?? "";
  f.priority = p.priority && (PRIORITIES as readonly string[]).includes(p.priority) ? p.priority : "";
  f.label = p.label ?? "";
  f.ready = p.ready === "1";
  f.overdue = p.overdue === "1";
  f.due = p.due === "today" || p.due === "week" ? p.due : "";
  f.mine = p.mine === "1";
  f.unassigned = p.unassigned === "1";
  f.q = p.q ?? "";
  if (p.group && ["project", "milestone", "agent", "priority", "status", "due", "none"].includes(p.group)) f.group = p.group as Filters["group"];
  if (p.sort && ["priority", "due", "updated", "created", "title", "estimate"].includes(p.sort)) f.sort = p.sort as Filters["sort"];
  return f;
}

function toParams(f: Filters): string {
  const s = new URLSearchParams();
  (Object.keys(DEFAULTS) as Array<keyof Filters>).forEach((k) => {
    const v = f[k];
    if (v === DEFAULTS[k] || v === "" || v === false) return;
    s.set(k, v === true ? "1" : String(v));
  });
  const str = s.toString();
  return str ? `?${str}` : "";
}

const dueBucket = (t: Row, day: string) => {
  if (!t.due_date) return "No date";
  if (t.due_date < day) return "Overdue";
  if (t.due_date === day) return "Today";
  if (t.due_date <= addDays(day, 7)) return "This week";
  if (t.due_date <= addDays(day, 30)) return "This month";
  return "Later";
};
const DUE_ORDER = ["Overdue", "Today", "This week", "This month", "Later", "No date"];

export default function QueueClient({ rows: initialRows, projects, agents, labels, initial }: { rows: Row[]; projects: QueueProject[]; agents: string[]; labels: string[]; initial: Record<string, string | undefined> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);
  const [f, setF] = useState<Filters>(() => fromParams(initial));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peek, setPeek] = useState(true);
  const [busy, setBusy] = useState(false);
  const day = today();

  // Keep the URL in step so a view can be shared or bookmarked, without a server round trip.
  useEffect(() => {
    const qs = toParams(f);
    if (typeof window !== "undefined" && window.location.search !== qs) window.history.replaceState(null, "", `/queue${qs}`);
  }, [f]);

  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  const preset = (p: Partial<Filters>) => setF({ ...DEFAULTS, project: f.project, group: f.group, ...p });
  const activePreset = PRESETS.find((p) => Object.entries({ ...DEFAULTS, ...p.patch }).every(([k, v]) => (k === "project" || k === "group" ? true : f[k as keyof Filters] === v)))?.label;

  const visible = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const week = daysFromNow(7);
    return rows
      .filter((t) => (f.project ? t.project_id === f.project : t.project_status !== "paused" || f.status === "all"))
      .filter((t) => (f.status === "all" ? true : f.status === "open" ? t.status !== "done" : t.status === f.status))
      .filter((t) => !f.agent || t.agent === f.agent)
      .filter((t) => !f.priority || t.priority === f.priority)
      .filter((t) => !f.label || t.labels.includes(f.label))
      .filter((t) => !f.ready || t.ready)
      .filter((t) => !f.overdue || isOverdue(t.due_date, t.status === "done"))
      .filter((t) => !f.due || (!!t.due_date && t.status !== "done" && (f.due === "today" ? t.due_date <= day : t.due_date <= week)))
      .filter((t) => !f.mine || t.mine)
      .filter((t) => !f.unassigned || !t.agent)
      .filter((t) => !q || `${t.title} ${t.notes} ${t.project_name} ${t.labels.join(" ")} ${t.agent ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => {
        switch (f.sort) {
          case "due":
            return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          case "updated":
            return b.updated_at.localeCompare(a.updated_at);
          case "created":
            return b.created_at.localeCompare(a.created_at);
          case "title":
            return a.title.localeCompare(b.title);
          case "estimate":
            return (b.estimate ?? 0) - (a.estimate ?? 0);
          default:
            return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.sort_order - b.sort_order;
        }
      });
  }, [rows, f, day]);

  const groups = useMemo(() => {
    const key = (t: Row): string => {
      switch (f.group) {
        case "project":
          return t.project_name;
        case "milestone":
          return `${t.project_name} · ${t.milestone_title ?? "Unscheduled"}`;
        case "agent":
          return t.agent ? `@${t.agent}` : "Unassigned";
        case "priority":
          return t.priority;
        case "status":
          return t.status;
        case "due":
          return dueBucket(t, day);
        default:
          return "";
      }
    };
    const m = new Map<string, Row[]>();
    for (const t of visible) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
    const names = Array.from(m.keys());
    if (f.group === "priority") names.sort((a, b) => PRIORITY_RANK[a as Priority] - PRIORITY_RANK[b as Priority]);
    else if (f.group === "due") names.sort((a, b) => DUE_ORDER.indexOf(a) - DUE_ORDER.indexOf(b));
    else if (f.group === "status") names.sort((a, b) => TASK_STATUSES.indexOf(a as TaskStatus) - TASK_STATUSES.indexOf(b as TaskStatus));
    else if (f.group === "project" || f.group === "milestone") names.sort((a, b) => projects.findIndex((p) => a.startsWith(p.name)) - projects.findIndex((p) => b.startsWith(p.name)));
    return names.map((name) => ({ name, items: m.get(name)! }));
  }, [visible, f.group, day, projects]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const indexOf = useMemo(() => new Map(flat.map((t, i) => [t.id, i])), [flat]);

  const applyLocal = (ids: string[], patch: Partial<Task>) =>
    setRows((xs) => xs.map((t) => (ids.includes(t.id) ? { ...t, ...patch, updated_at: new Date().toISOString() } : t)));
  // On failure, put back only the rows this request touched; edits made meanwhile to other rows stay.
  const revert = (before: Row[]) => setRows((xs) => xs.map((x) => before.find((b) => b.id === x.id) ?? x));

  const patchOne = useCallback(
    async (t: Row, patch: Partial<Task>, note?: string) => {
      const before = rows.filter((r) => r.id === t.id);
      applyLocal([t.id], patch);
      try {
        const res = await api<{ task: Task; spawned: Task | null }>(`/api/tasks/${t.id}`, "PATCH", patch);
        setRows((xs) => xs.map((x) => (x.id === t.id ? { ...x, ...res.task } : x)));
        if (res.spawned) toast({ message: `Next occurrence due ${fmtDate(res.spawned.due_date)}.`, tone: "success" });
        else if (note) toast({ message: note, tone: "success" });
        invalidateIndex();
        router.refresh();
      } catch (e) {
        revert(before);
        toast({ message: (e as Error).message, tone: "error" });
      }
    },
    [rows, router, toast]
  );

  const bulk = async (patch: Partial<Task>, label: string) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBusy(true);
    const before = rows.filter((r) => ids.includes(r.id));
    applyLocal(ids, patch);
    try {
      const res = await api<{ tasks: Task[] }>("/api/tasks", "PATCH", { items: ids.map((id) => ({ id, ...patch })) });
      setRows((xs) => xs.map((x) => ({ ...x, ...(res.tasks.find((u) => u.id === x.id) ?? {}) })));
      toast({ message: `${label} on ${ids.length} task${ids.length > 1 ? "s" : ""}.`, tone: "success" });
      setSelected(new Set());
      invalidateIndex();
      router.refresh();
    } catch (e) {
      revert(before);
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} task${ids.length > 1 ? "s" : ""} and their subtasks?`)) return;
    setBusy(true);
    try {
      const res = await api<{ removed: Task[] }>("/api/tasks", "DELETE", { ids });
      const gone = new Set(res.removed.map((t) => t.id));
      setRows((xs) => xs.filter((t) => !gone.has(t.id)));
      setSelected(new Set());
      toast({
        message: `Deleted ${res.removed.length} task${res.removed.length > 1 ? "s" : ""}.`,
        action: {
          label: "Undo",
          onClick: async () => {
            await api("/api/tasks/restore", "POST", { tasks: res.removed });
            router.refresh();
          },
        },
      });
      invalidateIndex();
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const [editing, setEditing] = useState<string | null>(null);
  const { cursor, setCursor } = useListKeys(flat, {
    x: (t) => toggle(t.id),
    Enter: (t) => router.push(taskHref(t.id)),
    d: (t) => patchOne(t, { status: t.status === "done" ? "todo" : "done" }),
    s: (t) => t.status !== "doing" && patchOne(t, { status: "doing" }, `Started: ${t.title}`),
    b: (t) => {
      const why = prompt("What is in the way?");
      if (why) patchOne(t, { status: "blocked", notes: `${t.notes ? `${t.notes}\n\n` : ""}Blocked ${day}: ${why}` });
    },
    t: (t) => patchOne(t, { planned_for: t.planned_for === day ? null : day }, t.planned_for === day ? "Removed from today." : "Planned for today."),
    e: (t) => setEditing(t.id),
    p: () => setPeek((v) => !v),
    Escape: () => setSelected(new Set()),
  });
  const current = flat[cursor];

  return (
    <div className={selected.size ? "pb-24" : ""}>
      {/* presets */}
      <div className="flex flex-wrap items-stretch gap-px bg-line border border-line mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => preset(p.patch)}
            className={`px-3 py-2.5 font-mono text-[0.6rem] tracking-[0.18em] uppercase ${activePreset === p.label ? "bg-[rgba(139,115,85,0.08)] text-accent" : "bg-bg/70 text-fg-dim hover:text-fg"}`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex-1 min-w-[10rem] bg-bg/70 flex items-center px-3">
          <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="search…" className="w-full bg-transparent outline-none font-mono text-xs text-fg placeholder:text-fg-ghost py-2" />
        </div>
      </div>
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6 font-mono text-[0.62rem]">
        <select value={f.project} onChange={(e) => set({ project: e.target.value })} className={inputBase} aria-label="Project">
          <option value="">any project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={f.agent} onChange={(e) => set({ agent: e.target.value, unassigned: false })} className={inputBase} aria-label="Assignee">
          <option value="">any assignee</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              @{a}
            </option>
          ))}
        </select>
        <select value={f.priority} onChange={(e) => set({ priority: e.target.value })} className={inputBase} aria-label="Priority">
          <option value="">any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {labels.length ? (
          <select value={f.label} onChange={(e) => set({ label: e.target.value })} className={inputBase} aria-label="Label">
            <option value="">any label</option>
            {labels.map((l) => (
              <option key={l} value={l}>
                +{l}
              </option>
            ))}
          </select>
        ) : null}
        <select value={f.status} onChange={(e) => set({ status: e.target.value as Filters["status"] })} className={inputBase} aria-label="Status">
          <option value="open">open</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="all">all, including paused projects</option>
        </select>
        <span className="text-fg-ghost ml-2">group</span>
        <select value={f.group} onChange={(e) => set({ group: e.target.value as Filters["group"] })} className={inputBase} aria-label="Group by">
          {["project", "milestone", "agent", "priority", "status", "due", "none"].map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <span className="text-fg-ghost">sort</span>
        <select value={f.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })} className={inputBase} aria-label="Sort by">
          {["priority", "due", "updated", "created", "title", "estimate"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-fg-ghost ml-auto tnum">{visible.length} of {rows.length}</span>
        {toParams(f) ? (
          <button onClick={() => setF({ ...DEFAULTS })} className="text-fg-ghost hover:text-fg">clear</button>
        ) : null}
        <button onClick={() => setPeek((v) => !v)} className={`hidden lg:inline ${peek ? "text-accent" : "text-fg-ghost"} hover:text-fg`} title="Details panel (p)">
          details
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-8 ${peek ? "lg:grid-cols-[1fr_20rem]" : ""}`}>
        <div className="min-w-0">
          {!flat.length ? (
            <p className="text-fg-dim text-sm border border-dashed border-line px-4 py-6">Nothing matches. Clear a filter, or capture something with c.</p>
          ) : (
            groups.map((g) => (
              <section key={g.name} className="mb-8">
                {g.name ? (
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="mono-label">{g.name}</span>
                    <span className="font-mono text-[0.6rem] text-fg-ghost tnum">{g.items.length}</span>
                    <span className="font-mono text-[0.58rem] text-fg-ghost tnum">{g.items.reduce((n, t) => n + (t.estimate ?? 0), 0) || ""}{g.items.some((t) => t.estimate) ? " pts" : ""}</span>
                    {f.group === "project" ? (
                      <button
                        onClick={() => setSelected(new Set([...Array.from(selected), ...g.items.map((t) => t.id)]))}
                        className="ml-auto font-mono text-[0.55rem] text-fg-ghost hover:text-fg"
                      >
                        select all
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <ul className="border border-line bg-bg/85 divide-y divide-line-soft">
                  {g.items.map((t) => {
                    const i = indexOf.get(t.id)!;
                    const late = isOverdue(t.due_date, t.status === "done");
                    const sel = selected.has(t.id);
                    return (
                      <li
                        key={t.id}
                        data-cursor={i}
                        onMouseEnter={() => setCursor(i)}
                        className={`flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 px-3 py-2 ${i === cursor ? "bg-[rgba(139,115,85,0.08)]" : ""} ${sel ? "border-l-2 border-accent" : "border-l-2 border-transparent"}`}
                      >
                        <input type="checkbox" checked={sel} onChange={() => toggle(t.id)} className="shrink-0" aria-label={`Select ${t.title}`} />
                        <input
                          type="checkbox"
                          checked={t.status === "done"}
                          onChange={() => patchOne(t, { status: t.status === "done" ? "todo" : "done" })}
                          className="shrink-0 accent-[#8b7355]"
                          aria-label={`Mark ${t.title} done`}
                          title="Done"
                        />
                        <span className="font-mono text-[0.55rem] text-accent w-4 shrink-0" title={`${t.priority} priority`}>
                          {t.priority === "medium" ? "" : PRIORITY_MARK[t.priority]}
                        </span>
                        <span className={`flex-1 min-w-[12rem] text-[0.9rem] ${t.status === "done" ? "line-through text-fg-ghost" : "text-fg"}`}>
                          {editing === t.id ? (
                            <input
                              autoFocus
                              defaultValue={t.title}
                              onBlur={(e) => {
                                setEditing(null);
                                if (e.target.value.trim() && e.target.value.trim() !== t.title) patchOne(t, { title: e.target.value.trim() });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="w-full bg-bg border border-accent px-1 outline-none"
                            />
                          ) : (
                            <Link href={taskHref(t.id)} className="hover:text-accent">
                              {t.parent_id ? <span className="text-fg-ghost">{t.path.slice(0, t.path.length - t.title.length)}</span> : null}
                              {t.title}
                            </Link>
                          )}
                          {f.group !== "project" && f.group !== "milestone" ? (
                            <span className="font-mono text-[0.58rem] text-fg-ghost"> · <SubLink href={projectHref(t.project_id)}>{t.project_name}</SubLink></span>
                          ) : null}
                        </span>
                        {t.labels.slice(0, 2).map((l) => (
                          <button key={l} onClick={() => set({ label: l })} className="font-mono text-[0.55rem] text-fg-ghost hover:text-accent shrink-0">+{l}</button>
                        ))}
                        {t.ready ? <Chip tone="accent">ready</Chip> : t.status === "todo" && t.waiting.length ? <Chip title={t.waiting.join(", ")}>after {t.waiting.length}</Chip> : null}
                        {t.status === "doing" ? <Chip tone="accent">doing</Chip> : t.status === "blocked" ? <Chip tone="solid">blocked</Chip> : null}
                        {t.planned_for === day ? <Chip>today</Chip> : null}
                        {t.subtasks ? <span className="font-mono text-[0.55rem] text-fg-ghost shrink-0 tnum">{t.subtasks_done}/{t.subtasks}</span> : null}
                        <select
                          value={t.agent ?? ""}
                          onChange={(e) => patchOne(t, { agent: e.target.value || null })}
                          className={`font-mono text-[0.6rem] bg-transparent outline-none max-w-[7rem] shrink-0 ${t.agent ? "text-accent" : "text-fg-ghost"}`}
                          aria-label="Assignee"
                        >
                          <option value="">@ unassigned</option>
                          {Array.from(new Set([ME, ...agents])).map((a) => (
                            <option key={a} value={a}>
                              @{a}
                            </option>
                          ))}
                        </select>
                        <span className={`font-mono text-[0.58rem] shrink-0 w-14 text-right ${late ? "text-fg" : "text-fg-ghost"}`} title={t.due_date ? fmtDate(t.due_date) : ""}>
                          {t.due_date ? dueLabel(t.due_date) : ""}
                        </span>
                        <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0 w-8 text-right">{t.estimate ? `${t.estimate}pt` : ""}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {peek ? (
          <aside className="hidden lg:block">
            <div className="sticky top-6">
              {current ? <Peek t={current} agents={agents} projects={projects} onPatch={(p, note) => patchOne(current, p, note)} /> : <p className="text-fg-ghost text-sm">Move the cursor onto a task to see its details.</p>}
            </div>
          </aside>
        ) : null}
      </div>

      {selected.size ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 glass border border-line shadow-[var(--shadow-lifted)] px-4 py-3 flex flex-wrap items-center gap-2 font-mono text-[0.62rem] max-w-[calc(100vw-2rem)]">
          <span className="text-fg mr-2 tnum">{selected.size} selected</span>
          <select onChange={(e) => e.target.value && bulk({ status: e.target.value as TaskStatus }, `Status ${e.target.value}`)} value="" className={inputBase} aria-label="Set status">
            <option value="">status…</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select onChange={(e) => bulk({ agent: e.target.value === "__none" ? null : e.target.value }, "Assigned")} value="" className={inputBase} aria-label="Assign">
            <option value="">assign…</option>
            <option value="__none">unassign</option>
            {Array.from(new Set([ME, ...agents])).map((a) => (
              <option key={a} value={a}>
                @{a}
              </option>
            ))}
          </select>
          <select onChange={(e) => e.target.value && bulk({ priority: e.target.value as Priority }, `Priority ${e.target.value}`)} value="" className={inputBase} aria-label="Set priority">
            <option value="">priority…</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-fg-dim">
            due
            <input type="date" onChange={(e) => e.target.value && bulk({ due_date: e.target.value }, "Due date set")} className={inputBase} aria-label="Set due date" />
          </label>
          <button onClick={() => bulk({ planned_for: day }, "Planned for today")} className={btnGhost} disabled={busy}>Today</button>
          <button onClick={() => bulk({ snoozed_until: addDays(day, 7) }, "Snoozed a week")} className={btnGhost} disabled={busy}>Snooze 1w</button>
          <button onClick={bulkDelete} className={btnGhost} disabled={busy}>Delete</button>
          <button onClick={() => setSelected(new Set())} className="text-fg-ghost hover:text-fg ml-1" aria-label="Clear selection">×</button>
        </div>
      ) : null}
    </div>
  );
}

/** The cursor row's details, editable in place. */
function Peek({ t, agents, projects, onPatch }: { t: Row; agents: string[]; projects: QueueProject[]; onPatch: (p: Partial<Task>, note?: string) => void }) {
  const project = projects.find((p) => p.id === t.project_id);
  return (
    <div className="border border-line bg-bg/85 p-4 flex flex-col gap-4 max-h-[calc(100vh-4rem)] overflow-y-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <StatusDot status={t.project_status} />
          <Link href={projectHref(t.project_id)} className="font-mono text-[0.6rem] text-fg-dim hover:text-accent">{t.project_name}</Link>
          {t.milestone_title ? <span className="font-mono text-[0.6rem] text-fg-ghost truncate">· {t.milestone_title}</span> : null}
        </div>
        <Link href={taskHref(t.id)} className="serif-display text-[1.3rem] leading-tight text-fg hover:text-accent">{t.title} →</Link>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[0.6rem]">
        <label className="flex flex-col gap-1 text-fg-ghost">
          status
          <select value={t.status} onChange={(e) => onPatch({ status: e.target.value as TaskStatus })} className={inputBase}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-fg-ghost">
          priority
          <select value={t.priority} onChange={(e) => onPatch({ priority: e.target.value as Priority })} className={inputBase}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-fg-ghost">
          assignee
          <select value={t.agent ?? ""} onChange={(e) => onPatch({ agent: e.target.value || null })} className={inputBase}>
            <option value="">unassigned</option>
            {Array.from(new Set([ME, ...(project?.agents ?? []), ...agents])).map((a) => (
              <option key={a} value={a}>
                @{a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-fg-ghost">
          milestone
          <select value={t.milestone_id ?? ""} onChange={(e) => onPatch({ milestone_id: e.target.value || null })} className={inputBase} disabled={!!t.parent_id}>
            <option value="">unscheduled</option>
            {(project?.milestones ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.done ? "✓ " : ""}{m.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-fg-ghost">
          due
          <input type="date" value={t.due_date ?? ""} onChange={(e) => onPatch({ due_date: e.target.value || null })} className={inputBase} />
        </label>
        <label className="flex flex-col gap-1 text-fg-ghost">
          planned for
          <input type="date" value={t.planned_for ?? ""} onChange={(e) => onPatch({ planned_for: e.target.value || null })} className={inputBase} />
        </label>
        <label className="flex flex-col gap-1 text-fg-ghost">
          estimate
          <select value={t.estimate ?? ""} onChange={(e) => onPatch({ estimate: e.target.value ? Number(e.target.value) : null })} className={inputBase}>
            <option value="">none</option>
            {ESTIMATES.map((n) => (
              <option key={n} value={n}>
                {n} pt
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-fg-ghost">
          repeats
          <select value={t.recurrence ?? ""} onChange={(e) => onPatch({ recurrence: (e.target.value || null) as Task["recurrence"] })} className={inputBase}>
            <option value="">never</option>
            {RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {RECURRENCE_META[r].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-fg-ghost col-span-2">
          snoozed until
          <input type="date" value={t.snoozed_until ?? ""} onChange={(e) => onPatch({ snoozed_until: e.target.value || null })} className={inputBase} />
        </label>
      </div>
      <div>
        <div className="mono-label-dim mb-1">labels</div>
        <TagInput value={t.labels} onChange={(labels) => onPatch({ labels })} suggestions={LABEL_PRESETS} placeholder="add label…" prefix="+" />
      </div>
      <div>
        <div className="mono-label-dim mb-1">done when</div>
        <div className="text-[0.82rem] text-fg-dim leading-relaxed border border-line bg-bg/70 p-2 min-h-[3rem]">
          <InlineText multiline value={t.acceptance} placeholder="Acceptance criteria…" onSave={(acceptance) => onPatch({ acceptance })} />
        </div>
      </div>
      <div>
        <div className="mono-label-dim mb-1">notes</div>
        <div className="text-[0.82rem] text-fg-dim leading-relaxed border border-line bg-bg/70 p-2 min-h-[3rem]">
          <InlineText multiline value={t.notes} placeholder="Context, links, steps…" onSave={(notes) => onPatch({ notes })} />
        </div>
      </div>
      <div className="font-mono text-[0.58rem] text-fg-ghost flex flex-wrap gap-x-3">
        <span>updated {relTime(t.updated_at)}</span>
        {t.thread ? <Link href={taskHref(t.id)} className="hover:text-accent">{t.thread} in thread →</Link> : null}
        {t.agent && t.agent !== ME ? <Link href={facetHref("agent", t.agent)} className="hover:text-accent">@{t.agent}&apos;s projects</Link> : null}
        <span>{STATUS_META[t.project_status].label} project</span>
      </div>
    </div>
  );
}
