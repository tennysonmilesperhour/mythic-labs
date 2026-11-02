"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ESTIMATES,
  LABEL_PRESETS,
  RECURRENCES,
  RECURRENCE_META,
  TASK_STATUSES,
  fmtDate,
  isOverdue,
  isReady,
  isSnoozed,
  pointsOf,
  relTime,
  today,
  waitingOn,
  type Milestone,
  type Task,
  type TaskStatus,
} from "@/lib/projectTypes";
import { Chip, InlineText, PRIORITY_MARK, Progress, TagInput, api, btnGhost, btnPrimary, inputBase } from "@/components/ProjectBits";
import { EditableMarkdown } from "@/components/Markdown";
import { GlyphClose } from "@/components/Glyphs";
import { isMine, taskHref } from "@/lib/taskMap";
import { useToast } from "@/components/Toast";
import { PLAN_TEMPLATES } from "@/lib/templates";
import { DateInput, type Store } from "./ProjectDetailClient";

/** A task and every task beneath it. */
function subtreeIds(tasks: Task[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) {
      if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) {
        ids.add(t.id);
        grew = true;
      }
    }
  }
  return ids;
}

const byOrder = (a: Task, b: Task) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

type Drag = { id: string; parent_id: string | null };
type Over = { id: string; where: "before" | "after" } | { zone: string | null } | null;

export default function PlanTab({ store }: { store: Store }) {
  const { project, milestones, tasks, setMilestones, setTasks, fail } = store;
  const { toast } = useToast();
  const [hideDone, setHideDone] = useState(false);
  const [agentFilter, setAgentFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => {
    // Deep link (?task=…): expand the task's ancestors so it's visible.
    const s = new Set<string>();
    const byId = new Map(tasks.map((t) => [t.id, t]));
    let cur = store.focusTask ? byId.get(store.focusTask) : undefined;
    if (cur) s.add(cur.id);
    while (cur?.parent_id) {
      s.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
    return s;
  });
  useEffect(() => {
    if (!store.focusTask) return;
    document.getElementById(`task-${store.focusTask}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [store.focusTask]);
  const [msTitle, setMsTitle] = useState("");
  const [msDate, setMsDate] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);

  const applyTemplate = async (id: string) => {
    const t = PLAN_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (milestones.length && !confirm(`Add the ${t.name} template's ${t.milestones.length} milestones after the existing ones?`)) return;
    setTemplateBusy(true);
    try {
      const res = await api<{ milestones: Milestone[]; tasks: Task[] }>(`/api/projects/${project.id}/template`, "POST", { template: id });
      setMilestones((ms) => [...ms, ...res.milestones]);
      setTasks((ts) => [...ts, ...res.tasks]);
      toast({ message: `${t.name}: ${res.milestones.length} milestones and ${res.tasks.length} tasks added.`, tone: "success" });
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setTemplateBusy(false);
    }
  };
  const [over, setOver] = useState<Over>(null);
  const dragRef = useRef<Drag | null>(null);

  const children = useMemo(() => {
    const m = new Map<string | null, Task[]>();
    for (const t of tasks) m.set(t.parent_id, [...(m.get(t.parent_id) || []), t]);
    m.forEach((list) => list.sort(byOrder));
    return m;
  }, [tasks]);

  const labels = useMemo(() => Array.from(new Set(tasks.flatMap((t) => t.labels))).sort(), [tasks]);

  // A task is shown when it, or anything beneath it, passes the filters.
  const visible = useMemo(() => {
    const keep = new Set<string>();
    const walk = (t: Task): boolean => {
      const kids = (children.get(t.id) || []).map(walk).some(Boolean);
      const self = (!hideDone || t.status !== "done") && (!agentFilter || t.agent === agentFilter) && (!labelFilter || t.labels.includes(labelFilter));
      if (self || kids) keep.add(t.id);
      return self || kids;
    };
    (children.get(null) || []).forEach(walk);
    return keep;
  }, [children, hideDone, agentFilter, labelFilter]);

  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const addTask = async (input: Partial<Task>) => {
    try {
      const { task } = await api<{ task: Task }>(`/api/projects/${project.id}/tasks`, "POST", {
        ...input,
        sort_order: tasks.length,
      });
      setTasks((ts) => [...ts, task]);
      if (task.parent_id) setOpen((s) => new Set(s).add(task.parent_id!));
    } catch (err: unknown) {
      fail((err as Error).message);
    }
  };

  const patchTask = async (id: string, patch: Partial<Task>) => {
    const prev = tasks;
    // The server moves a task's subtasks with it between milestones; mirror that here so the headers count right.
    const moved = "milestone_id" in patch ? subtreeIds(tasks, id) : new Set([id]);
    const place = (t: Task) => (t.id === id ? { ...t, ...patch } : moved.has(t.id) ? { ...t, milestone_id: patch.milestone_id ?? null } : t);
    setTasks((ts) => ts.map(place));
    try {
      const { task, spawned } = await api<{ task: Task; spawned: Task | null }>(`/api/tasks/${id}`, "PATCH", patch);
      setTasks((ts) => [...ts.map((t) => (t.id === id ? task : place(t))), ...(spawned ? [spawned] : [])]);
      if (spawned) toast({ message: `Next occurrence added, due ${fmtDate(spawned.due_date)}.`, tone: "success" });
    } catch (err: unknown) {
      setTasks(prev);
      fail((err as Error).message);
    }
  };

  const removeTask = async (id: string) => {
    const kids = tasks.filter((t) => t.parent_id === id).length;
    if (kids && !confirm(`Delete this task and its ${kids} subtask${kids > 1 ? "s" : ""}?`)) return;
    const prev = tasks;
    const drop = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of tasks) {
        if (t.parent_id && drop.has(t.parent_id) && !drop.has(t.id)) {
          drop.add(t.id);
          grew = true;
        }
      }
    }
    setTasks((ts) => ts.filter((t) => !drop.has(t.id)));
    try {
      const res = await api<{ removed: Task[] }>(`/api/tasks/${id}`, "DELETE");
      toast({
        message: `Deleted ${res.removed.length === 1 ? res.removed[0].title : `${res.removed.length} tasks`}.`,
        action: {
          label: "Undo",
          onClick: async () => {
            const back = await api<{ restored: Task[] }>("/api/tasks/restore", "POST", { tasks: res.removed });
            setTasks((ts) => [...ts, ...back.restored]);
          },
        },
      });
    } catch (e) {
      setTasks(prev);
      fail((e as Error).message);
    }
  };

  const addMilestone = async () => {
    if (!msTitle.trim()) return;
    try {
      const { milestone } = await api<{ milestone: Milestone }>(`/api/projects/${project.id}/milestones`, "POST", {
        title: msTitle.trim(),
        target_date: msDate || null,
        sort_order: milestones.length,
      });
      setMilestones((ms) => [...ms, milestone]);
      setMsTitle("");
      setMsDate("");
    } catch (err: unknown) {
      fail((err as Error).message);
    }
  };

  const patchMilestone = async (id: string, patch: Partial<Milestone>) => {
    setMilestones((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    try {
      const { milestone } = await api<{ milestone: Milestone }>(`/api/milestones/${id}`, "PATCH", patch);
      setMilestones((ms) => ms.map((m) => (m.id === id ? milestone : m)));
    } catch (err: unknown) {
      fail((err as Error).message);
    }
  };

  const removeMilestone = async (id: string) => {
    if (!confirm("Delete this milestone? Its tasks move to Unscheduled.")) return;
    setMilestones((ms) => ms.filter((m) => m.id !== id));
    setTasks((ts) => ts.map((t) => (t.milestone_id === id ? { ...t, milestone_id: null } : t)));
    await api(`/api/milestones/${id}`, "DELETE").catch((e: Error) => fail(e.message));
  };

  const moveMilestone = (id: string, dir: -1 | 1) => {
    const sorted = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
    const i = sorted.findIndex((m) => m.id === id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((m, idx) => {
      if (m.sort_order !== idx) patchMilestone(m.id, { sort_order: idx });
    });
  };

  // ─── drag and drop: roots move among roots (and between milestones); subtasks among their siblings ───

  const commitOrder = async (siblings: Task[], parentId: string | null) => {
    // On failure, put back only the rows this request moved; edits made meanwhile to other rows stay.
    const before = new Map(tasks.map((t) => [t.id, t]));
    const order = siblings.map((t, i) => ({ id: t.id, sort_order: i, milestone_id: t.milestone_id }));
    setTasks((ts) => ts.map((t) => {
      const o = order.find((x) => x.id === t.id);
      return o ? { ...t, sort_order: o.sort_order, milestone_id: parentId === null ? o.milestone_id : t.milestone_id } : t;
    }));
    try {
      // The server answers with each task's placement (order, milestone, parent); everything else is kept as shown.
      const res = await api<{ tasks: Array<Pick<Task, "id" | "sort_order" | "milestone_id" | "parent_id" | "updated_at">> }>(`/api/projects/${project.id}/reorder`, "POST", {
        order: order.map((o) => ({ id: o.id, ...(parentId === null ? { milestone_id: o.milestone_id } : {}) })),
      });
      const placed = new Map(res.tasks.map((p) => [p.id, p]));
      setTasks((ts) => ts.map((t) => (placed.has(t.id) ? { ...t, ...placed.get(t.id)! } : t)));
    } catch (e) {
      setTasks((ts) => ts.map((t) => (order.some((o) => o.id === t.id) && before.has(t.id) ? before.get(t.id)! : t)));
      fail((e as Error).message);
    }
  };

  const dropOnRow = (target: Task, where: "before" | "after") => {
    const d = dragRef.current;
    if (!d || d.id === target.id) return;
    if (d.parent_id !== target.parent_id) return; // only among siblings
    const moving = tasks.find((t) => t.id === d.id);
    if (!moving) return;
    const siblings = (children.get(d.parent_id) || []).filter((t) => t.id !== d.id);
    const idx = siblings.findIndex((t) => t.id === target.id);
    const movedTask = d.parent_id === null ? { ...moving, milestone_id: target.milestone_id } : moving;
    siblings.splice(where === "before" ? idx : idx + 1, 0, movedTask);
    commitOrder(siblings, d.parent_id);
  };

  const dropOnZone = (milestoneId: string | null) => {
    const d = dragRef.current;
    if (!d || d.parent_id !== null) return;
    const moving = tasks.find((t) => t.id === d.id);
    if (!moving) return;
    const siblings = (children.get(null) || []).filter((t) => t.id !== d.id);
    siblings.push({ ...moving, milestone_id: milestoneId });
    commitOrder(siblings, null);
  };

  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
    setOver(null);
  };

  const subtreeCount = (id: string): { done: number; total: number } => {
    const kids = children.get(id) || [];
    return kids.reduce(
      (acc, k) => {
        const sub = subtreeCount(k.id);
        return { done: acc.done + (k.status === "done" ? 1 : 0) + sub.done, total: acc.total + 1 + sub.total };
      },
      { done: 0, total: 0 }
    );
  };

  const rowProps: RowProps = {
    kidsOf: children,
    visible,
    open,
    toggleOpen,
    addTask,
    patchTask,
    removeTask,
    subtreeCount,
    agentOptions: store.agentOptions,
    milestones,
    allTasks: tasks,
    focusTask: store.focusTask,
    drag,
    over,
    onDragStart: (t) => {
      dragRef.current = { id: t.id, parent_id: t.parent_id };
      setDrag(dragRef.current);
    },
    onDragOverRow: (t, where) => setOver({ id: t.id, where }),
    onDropRow: (t, where) => {
      dropOnRow(t, where);
      endDrag();
    },
    onDragEnd: endDrag,
  };

  const roots = children.get(null) || [];
  const sortedMs = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
  const zoneCls = (id: string | null) =>
    drag && drag.parent_id === null && over && "zone" in over && over.zone === id ? "outline outline-1 outline-accent bg-[rgba(139,115,85,0.05)]" : "";

  if (!milestones.length && !tasks.length) {
    return (
      <div>
        <div className="border border-dashed border-line bg-bg-warm/40 p-8 mb-8">
          <div className="serif-display text-2xl text-fg mb-2">An empty plan</div>
          <p className="text-fg-dim text-sm max-w-xl leading-relaxed mb-5">
            Start from a template and edit it down, or add the first milestone below. Every template marks the steps only you can do with @me.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PLAN_TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => applyTemplate(t.id)} disabled={templateBusy} className="text-left border border-line bg-bg/80 p-4 hover:border-accent disabled:opacity-50">
                <div className="text-[1rem] text-fg mb-1">{t.name}</div>
                <div className="text-[0.8rem] text-fg-dim leading-relaxed mb-2">{t.summary}</div>
                <div className="font-mono text-[0.58rem] text-fg-ghost">
                  {t.milestones.map((m) => m.title).join(" → ")} · {t.milestones.reduce((n, m) => n + m.tasks.length, 0)} tasks
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="border border-dashed border-line bg-bg-warm/50 p-4 flex flex-wrap items-center gap-3">
          <span className="mono-label">First milestone</span>
          <input
            value={msTitle}
            onChange={(e) => setMsTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMilestone()}
            placeholder="e.g. Private beta"
            className={`${inputBase} flex-1 min-w-[12rem]`}
          />
          <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} className={`${inputBase} w-40`} />
          <button onClick={addMilestone} disabled={!msTitle.trim()} className={btnPrimary}>
            Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <label className="font-mono text-[0.62rem] text-fg-dim flex items-center gap-2">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          hide done
        </label>
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="bg-bg/70 border border-line font-mono text-[0.62rem] text-fg-dim px-2 py-1 outline-none">
          <option value="">any agent</option>
          {store.agentOptions.map((a) => (
            <option key={a} value={a}>
              @{a}
            </option>
          ))}
        </select>
        {labels.length ? (
          <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} className="bg-bg/70 border border-line font-mono text-[0.62rem] text-fg-dim px-2 py-1 outline-none">
            <option value="">any label</option>
            {labels.map((l) => (
              <option key={l} value={l}>
                +{l}
              </option>
            ))}
          </select>
        ) : null}
        <button className={btnGhost} onClick={() => setOpen(new Set(tasks.map((t) => t.id)))}>
          Expand all
        </button>
        <button className={btnGhost} onClick={() => setOpen(new Set())}>
          Collapse
        </button>
        <span className="font-mono text-[0.58rem] text-fg-ghost ml-auto">drag a task to reorder it or move it to another milestone</span>
      </div>

      <ol className="relative border-l border-line ml-2">
        {sortedMs.map((m, idx) => {
          const own = roots.filter((t) => t.milestone_id === m.id);
          const all = tasks.filter((t) => t.milestone_id === m.id);
          const late = isOverdue(m.target_date, m.done);
          const pts = { done: all.filter((t) => t.status === "done").reduce((n, t) => n + pointsOf(t), 0), total: all.reduce((n, t) => n + pointsOf(t), 0) };
          return (
            <li
              key={m.id}
              className={`pl-8 pb-10 relative ${zoneCls(m.id)}`}
              onDragOver={(e) => {
                // Rows stop their own drag events, so reaching here means the pointer is over the milestone's open space.
                if (!drag || drag.parent_id !== null) return;
                e.preventDefault();
                setOver((o) => (o && "zone" in o && o.zone === m.id ? o : { zone: m.id }));
              }}
              onDrop={(e) => {
                if (!drag || drag.parent_id !== null) return;
                e.preventDefault();
                dropOnZone(m.id);
                endDrag();
              }}
            >
              <button
                onClick={() => patchMilestone(m.id, { done: !m.done })}
                title={m.done ? "Reopen milestone" : "Mark milestone done"}
                className={`absolute -left-[7px] top-[0.55rem] h-[13px] w-[13px] rotate-45 border ${
                  m.done ? "bg-accent border-accent" : late ? "bg-fg border-fg" : "bg-bg border-accent hover:bg-accent-light"
                }`}
              />
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1">
                <span className="font-mono text-[0.55rem] text-fg-ghost">{String(idx + 1).padStart(2, "0")}</span>
                <h3 className={`serif-display text-[1.6rem] leading-tight ${m.done ? "line-through text-fg-ghost" : ""}`}>
                  <InlineText value={m.title} onSave={(title) => title && patchMilestone(m.id, { title })} />
                </h3>
                <div className={`flex items-center gap-1 ${late ? "text-accent" : ""}`}>
                  <DateInput value={m.start_date} onChange={(start_date) => patchMilestone(m.id, { start_date })} />
                  <span className="text-fg-ghost">→</span>
                  <DateInput value={m.target_date} onChange={(target_date) => patchMilestone(m.id, { target_date })} />
                </div>
                {late ? <Chip tone="solid">overdue</Chip> : null}
                <span className="font-mono text-[0.58rem] text-fg-ghost tnum">{pts.done}/{pts.total} pts</span>
                <div className="ml-auto flex items-center gap-1 text-fg-ghost">
                  <button onClick={() => moveMilestone(m.id, -1)} className="px-1 hover:text-fg" title="Move up">↑</button>
                  <button onClick={() => moveMilestone(m.id, 1)} className="px-1 hover:text-fg" title="Move down">↓</button>
                  <button onClick={() => removeMilestone(m.id)} className="px-1 hover:text-fg" title="Delete milestone">
                    <GlyphClose size={10} />
                  </button>
                </div>
              </div>
              <div className="text-fg-dim text-[0.85rem] mb-3 max-w-2xl">
                <EditableMarkdown value={m.description} placeholder="Goal or definition of done…" onSave={(description) => patchMilestone(m.id, { description })} />
              </div>
              <div className="max-w-xs mb-4">
                <Progress done={all.filter((t) => t.status === "done").length} total={all.length} />
              </div>
              <TaskList tasks={own} depth={0} {...rowProps} />
              <AddTask placeholder="Add a task…" onAdd={(title) => addTask({ title, milestone_id: m.id })} />
            </li>
          );
        })}

        <li
          className={`pl-8 pb-6 relative ${zoneCls(null)}`}
          onDragOver={(e) => {
            if (!drag || drag.parent_id !== null) return;
            e.preventDefault();
            setOver((o) => (o && "zone" in o && o.zone === null ? o : { zone: null }));
          }}
          onDrop={(e) => {
            if (!drag || drag.parent_id !== null) return;
            e.preventDefault();
            dropOnZone(null);
            endDrag();
          }}
        >
          <span className="absolute -left-[5px] top-[0.6rem] h-[9px] w-[9px] rounded-full border border-fg-ghost bg-bg" />
          <h3 className="serif-display text-[1.4rem] text-fg-dim mb-3">Unscheduled</h3>
          <TaskList tasks={roots.filter((t) => !t.milestone_id)} depth={0} {...rowProps} />
          <AddTask placeholder="Add a task…" onAdd={(title) => addTask({ title })} />
        </li>
      </ol>

      <div className="border border-dashed border-line bg-bg-warm/50 p-4 mt-4 flex flex-wrap items-center gap-3">
        <span className="mono-label">New milestone</span>
        <input
          value={msTitle}
          onChange={(e) => setMsTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addMilestone()}
          placeholder="e.g. Private beta"
          className={`${inputBase} flex-1 min-w-[12rem]`}
        />
        <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} className={`${inputBase} w-40`} />
        <button onClick={addMilestone} disabled={!msTitle.trim()} className={btnPrimary}>
          Add
        </button>
        <select value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)} disabled={templateBusy} className={`${inputBase} w-auto`} aria-label="Add from a template">
          <option value="">or add from a template…</option>
          {PLAN_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type RowProps = {
  kidsOf: Map<string | null, Task[]>;
  visible: Set<string>;
  open: Set<string>;
  toggleOpen: (id: string) => void;
  addTask: (t: Partial<Task>) => void;
  patchTask: (id: string, p: Partial<Task>) => void;
  removeTask: (id: string) => void;
  subtreeCount: (id: string) => { done: number; total: number };
  agentOptions: string[];
  milestones: Milestone[];
  allTasks: Task[];
  focusTask: string | null;
  drag: Drag | null;
  over: Over;
  onDragStart: (t: Task) => void;
  onDragOverRow: (t: Task, where: "before" | "after") => void;
  onDropRow: (t: Task, where: "before" | "after") => void;
  onDragEnd: () => void;
};

function TaskList({ tasks, depth, ...rp }: { tasks: Task[]; depth: number } & RowProps) {
  const shown = tasks.filter((t) => rp.visible.has(t.id));
  if (!shown.length) return null;
  return (
    <ul className={depth ? "ml-6 border-l border-line pl-3" : ""}>
      {shown.map((t) => (
        <TaskRow key={t.id} task={t} depth={depth} {...rp} />
      ))}
    </ul>
  );
}

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "text-fg-ghost border-line bg-transparent",
  doing: "text-accent border-accent bg-transparent",
  blocked: "text-bg bg-fg border-fg",
  done: "text-fg-ghost border-line bg-transparent",
};

function TaskRow({ task: t, depth, ...rp }: { task: Task; depth: number } & RowProps) {
  const kids = rp.kidsOf.get(t.id) || [];
  const isOpen = rp.open.has(t.id);
  const sub = rp.subtreeCount(t.id);
  const done = t.status === "done";
  const late = isOverdue(t.due_date, done);
  const ready = isReady(t, rp.allTasks);
  const waiting = t.status === "todo" ? waitingOn(t, rp.allTasks) : [];
  const focused = rp.focusTask === t.id;
  const day = today();
  const dragging = rp.drag?.id === t.id;
  const overHere = rp.over && "id" in rp.over && rp.over.id === t.id ? rp.over.where : null;
  const canDropHere = rp.drag && rp.drag.id !== t.id && rp.drag.parent_id === t.parent_id;

  return (
    <li className="py-1" id={`task-${t.id}`}>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", t.id);
          rp.onDragStart(t);
        }}
        onDragEnd={rp.onDragEnd}
        onDragOver={(e) => {
          if (!canDropHere) return;
          e.preventDefault();
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          rp.onDragOverRow(t, e.clientY < r.top + r.height / 2 ? "before" : "after");
        }}
        onDrop={(e) => {
          if (!canDropHere) return;
          e.preventDefault();
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          rp.onDropRow(t, e.clientY < r.top + r.height / 2 ? "before" : "after");
        }}
        className={`group relative flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-1 py-1 px-1 hover:bg-[rgba(139,115,85,0.05)] ${
          focused ? "bg-[rgba(139,115,85,0.1)] outline outline-1 outline-accent" : ""
        } ${dragging ? "opacity-40" : ""} ${overHere === "before" ? "border-t-2 border-accent" : overHere === "after" ? "border-b-2 border-accent" : "border-y-2 border-transparent"}`}
      >
        <span className="cursor-grab active:cursor-grabbing text-fg-ghost font-mono text-[0.7rem] opacity-0 group-hover:opacity-100 shrink-0 select-none" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
        <button
          onClick={() => rp.toggleOpen(t.id)}
          className={`w-4 text-fg-ghost hover:text-fg font-mono text-[0.7rem] shrink-0 ${
            kids.length || isOpen ? "" : "opacity-0 group-hover:opacity-100"
          }`}
          title={isOpen ? "Collapse" : "Expand: notes and subtasks"}
        >
          {isOpen ? "▾" : "▸"}
        </button>
        <input
          type="checkbox"
          checked={done}
          onChange={() => rp.patchTask(t.id, { status: done ? "todo" : "done" })}
          className="accent-[#8b7355] shrink-0"
        />
        <span className="font-mono text-[0.55rem] text-accent w-4 shrink-0" title={`${t.priority} priority`}>
          {t.priority === "medium" ? "" : PRIORITY_MARK[t.priority]}
        </span>
        <span className={`flex-1 min-w-[10rem] text-[0.92rem] ${done ? "line-through text-fg-ghost" : "text-fg"}`}>
          <InlineText value={t.title} onSave={(title) => title && rp.patchTask(t.id, { title })} />
        </span>
        {t.labels.slice(0, 3).map((l) => (
          <span key={l} className="font-mono text-[0.55rem] text-fg-ghost shrink-0">+{l}</span>
        ))}
        {sub.total ? (
          <span className="font-mono text-[0.58rem] text-fg-ghost tnum shrink-0">
            {sub.done}/{sub.total}
          </span>
        ) : null}
        {t.estimate ? <span className="font-mono text-[0.55rem] text-fg-ghost shrink-0 tnum">{t.estimate}pt</span> : null}
        {t.recurrence ? <span className="font-mono text-[0.6rem] text-fg-ghost shrink-0" title={`Repeats ${RECURRENCE_META[t.recurrence].label.toLowerCase()}`}>↻</span> : null}
        {t.planned_for === day && !done ? <span className="font-mono text-[0.52rem] uppercase tracking-[0.15em] text-accent shrink-0">today</span> : null}
        {isSnoozed(t) ? <span className="font-mono text-[0.52rem] uppercase tracking-[0.15em] text-fg-ghost shrink-0" title={`Snoozed until ${fmtDate(t.snoozed_until)}`}>zz</span> : null}
        {ready ? (
          <span className="font-mono text-[0.52rem] uppercase tracking-[0.15em] text-accent border border-accent px-1 shrink-0" title="Unblocked: an agent can start this now">
            ready
          </span>
        ) : null}
        {waiting.length ? (
          <span className="font-mono text-[0.55rem] text-fg-ghost shrink-0 max-w-[10rem] truncate" title={waiting.map((w) => w.title).join(", ")}>
            after{" "}
            <Link href={taskHref(waiting[0].id)} className="hover:text-accent">
              {waiting[0].title}
            </Link>
            {waiting.length > 1 ? ` +${waiting.length - 1}` : ""}
          </span>
        ) : null}
        {t.status === "doing" && t.claimed_at ? (
          <span className="font-mono text-[0.55rem] text-fg-ghost shrink-0">since {relTime(t.claimed_at)}</span>
        ) : null}
        {(t.notes || t.acceptance) && !isOpen ? (
          <span className="text-fg-ghost text-[0.6rem]" title={[t.acceptance && `Done when: ${t.acceptance}`, t.notes].filter(Boolean).join("\n")}>¶</span>
        ) : null}
        <select
          value={t.status}
          onChange={(e) => rp.patchTask(t.id, { status: e.target.value as TaskStatus })}
          className={`font-mono text-[0.55rem] uppercase tracking-[0.12em] border px-1 py-0.5 outline-none shrink-0 ${STATUS_STYLE[t.status]}`}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s} className="text-fg bg-bg">
              {s}
            </option>
          ))}
        </select>
        <select
          value={t.agent ?? ""}
          onChange={(e) => rp.patchTask(t.id, { agent: e.target.value || null })}
          className={`font-mono text-[0.6rem] bg-transparent outline-none max-w-[8rem] shrink-0 ${
            t.agent ? "text-accent" : "text-fg-ghost opacity-0 group-hover:opacity-100"
          }`}
          title="Assigned agent"
        >
          <option value="">@ unassigned</option>
          {rp.agentOptions.map((a) => (
            <option key={a} value={a}>
              @{a}
            </option>
          ))}
        </select>
        <span className={late ? "text-accent" : t.due_date ? "" : "opacity-0 group-hover:opacity-100"}>
          <DateInput value={t.due_date} onChange={(due_date) => rp.patchTask(t.id, { due_date })} />
        </span>
        <Link
          href={taskHref(t.id)}
          className={`font-mono text-[0.55rem] uppercase tracking-[0.15em] shrink-0 hover:text-fg ${
            isMine(t) ? "text-accent" : "text-fg-ghost opacity-0 group-hover:opacity-100"
          }`}
          title="Open the task map: steps, links and text to paste"
        >
          map →
        </Link>
        <button
          onClick={() => rp.removeTask(t.id)}
          className="text-fg-ghost hover:text-fg opacity-0 group-hover:opacity-100 shrink-0"
          title="Delete task"
        >
          <GlyphClose size={10} />
        </button>
      </div>

      {isOpen ? (
        <div className="ml-6 border-l border-line pl-3 pb-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 py-1">
            <div className="text-[0.82rem] text-fg-dim">
              <span className="mono-label-dim block mb-0.5">Done when</span>
              <EditableMarkdown value={t.acceptance} placeholder="Acceptance criteria an agent can check…" onSave={(acceptance) => rp.patchTask(t.id, { acceptance })} />
            </div>
            <div className="text-[0.82rem] text-fg-dim">
              <span className="mono-label-dim block mb-0.5">Notes</span>
              <EditableMarkdown value={t.notes} placeholder="Context, links, approach… Markdown works; '- step' lines become a checklist on the task map." onSave={(notes) => rp.patchTask(t.id, { notes })} />
            </div>
          </div>
          <DependsOn task={t} {...rp} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[0.58rem] text-fg-ghost py-1">
            <label className="flex items-center gap-1">
              priority
              <select value={t.priority} onChange={(e) => rp.patchTask(t.id, { priority: e.target.value as Task["priority"] })} className="bg-transparent text-fg-dim outline-none">
                {["critical", "high", "medium", "low"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              estimate
              <select value={t.estimate ?? ""} onChange={(e) => rp.patchTask(t.id, { estimate: e.target.value ? Number(e.target.value) : null })} className="bg-transparent text-fg-dim outline-none">
                <option value="">none</option>
                {ESTIMATES.map((n) => (
                  <option key={n} value={n}>
                    {n} pt
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              repeats
              <select value={t.recurrence ?? ""} onChange={(e) => rp.patchTask(t.id, { recurrence: (e.target.value || null) as Task["recurrence"] })} className="bg-transparent text-fg-dim outline-none">
                <option value="">never</option>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_META[r].label.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              plan for
              <DateInput value={t.planned_for} onChange={(planned_for) => rp.patchTask(t.id, { planned_for })} />
              {t.planned_for !== day ? (
                <button onClick={() => rp.patchTask(t.id, { planned_for: day })} className="text-accent hover:text-fg">today</button>
              ) : null}
            </label>
            <label className="flex items-center gap-1">
              snooze until
              <DateInput value={t.snoozed_until} onChange={(snoozed_until) => rp.patchTask(t.id, { snoozed_until })} />
            </label>
            {depth === 0 ? (
              <label className="flex items-center gap-1">
                milestone
                <select
                  value={t.milestone_id ?? ""}
                  onChange={(e) => rp.patchTask(t.id, { milestone_id: e.target.value || null })}
                  className="bg-transparent text-fg-dim outline-none"
                >
                  <option value="">unscheduled</option>
                  {rp.milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {t.done_at ? <span>done {fmtDate(t.done_at)}</span> : null}
          </div>
          <div className="py-1 max-w-md">
            <TagInput value={t.labels} onChange={(labels) => rp.patchTask(t.id, { labels })} suggestions={LABEL_PRESETS} placeholder="add label…" prefix="+" />
          </div>
          <TaskList tasks={kids} depth={depth + 1} {...rp} />
          <AddTask
            placeholder="Add a subtask…"
            onAdd={(title) => rp.addTask({ title, parent_id: t.id, milestone_id: t.milestone_id, agent: t.agent })}
          />
        </div>
      ) : null}
    </li>
  );
}

function AddTask({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-center gap-2 py-1 pl-7">
      <span className="text-fg-ghost font-mono text-xs">+</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) {
            onAdd(v.trim());
            setV("");
          }
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-[0.85rem] text-fg placeholder:text-fg-ghost border-b border-transparent focus:border-line py-0.5"
      />
    </div>
  );
}

/** Pick the tasks this one waits on. */
function DependsOn({ task, allTasks, patchTask }: { task: Task } & RowProps) {
  const byId = new Map(allTasks.map((x) => [x.id, x]));
  // Exclude itself and its own descendants (it can't wait on its own parts).
  const below = new Set<string>([task.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const x of allTasks) {
      if (x.parent_id && below.has(x.parent_id) && !below.has(x.id)) {
        below.add(x.id);
        grew = true;
      }
    }
  }
  const options = allTasks.filter((x) => !below.has(x.id) && !task.depends_on.includes(x.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1 font-mono text-[0.58rem] text-fg-ghost">
      <span>waits on</span>
      {task.depends_on.map((id) => {
        const dep = byId.get(id);
        if (!dep) return null;
        return (
          <Chip
            key={id}
            tone={dep.status === "done" ? "dim" : "accent"}
            onRemove={() => patchTask(task.id, { depends_on: task.depends_on.filter((x) => x !== id) })}
          >
            <Link href={taskHref(dep.id)} className="hover:text-accent" title="Open its task map">
              {dep.status === "done" ? "✓ " : ""}
              {dep.title}
            </Link>
          </Chip>
        );
      })}
      <select
        value=""
        onChange={(e) => e.target.value && patchTask(task.id, { depends_on: [...task.depends_on, e.target.value] })}
        className="bg-transparent text-fg-dim outline-none max-w-[14rem]"
      >
        <option value="">{task.depends_on.length ? "+ another" : "nothing · add"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>
    </div>
  );
}
