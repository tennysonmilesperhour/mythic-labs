"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  PRIORITY_RANK,
  addDays,
  dueLabel,
  fmtDate,
  pointsOf,
  relTime,
  renderDigestMarkdown,
  type Hub,
  type Task,
  type TaskRef,
} from "@/lib/projectTypes";
import { ME, facetHref, isMine, projectHref, taskHref } from "@/lib/taskMap";
import { Chip, PRIORITY_MARK, api, btnGhost, btnPrimary } from "@/components/ProjectBits";
import { StatusDot } from "@/components/ProjectBits";
import SubLink from "@/components/SubLink";
import { useToast } from "@/components/Toast";
import { useListKeys } from "@/components/useListKeys";
import { invalidateIndex } from "@/components/CommandLayer";

const CAPACITY_KEY = "mythic-capacity";
const DEFAULT_CAPACITY = 8;

type Why = "doing" | "overdue" | "due" | "carried" | "planned" | "blocked";

function whyToday(t: Task, day: string): Why {
  if (t.status === "doing") return "doing";
  if (t.status === "blocked") return "blocked";
  if (t.due_date && t.due_date < day) return "overdue";
  if (t.due_date === day) return "due";
  if (t.planned_for && t.planned_for < day) return "carried";
  return "planned";
}

const WHY_LABEL: Record<Why, string> = {
  doing: "in progress",
  overdue: "overdue",
  due: "due today",
  carried: "carried over",
  planned: "planned",
  blocked: "blocked",
};

export default function TodayClient({ hub, suggestions, day }: { hub: Hub; suggestions: TaskRef[]; day: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [plan, setPlan] = useState<TaskRef[]>(hub.today);
  const [pool, setPool] = useState<TaskRef[]>(suggestions);
  const [done, setDone] = useState<TaskRef[]>(hub.doneToday);
  useEffect(() => setPlan(hub.today), [hub.today]);
  useEffect(() => setPool(suggestions), [suggestions]);
  useEffect(() => setDone(hub.doneToday), [hub.doneToday]);
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY);
  const [showPool, setShowPool] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(CAPACITY_KEY));
      if (v > 0) setCapacity(v);
    } catch {
      // The default stands.
    }
  }, []);
  const saveCapacity = (v: number) => {
    setCapacity(v);
    try {
      localStorage.setItem(CAPACITY_KEY, String(v));
    } catch {
      // Fine without storage.
    }
  };

  const plannedPoints = plan.reduce((n, t) => n + pointsOf(t), 0);
  const donePoints = done.reduce((n, t) => n + pointsOf(t), 0);
  const over = plannedPoints > capacity;
  const tomorrow = addDays(day, 1);

  const patch = async (t: TaskRef, p: Partial<Task>, note?: string) => {
    setBusy(t.id);
    try {
      const res = await api<{ task: Task; spawned: Task | null }>(`/api/tasks/${t.id}`, "PATCH", p);
      const updated = { ...t, ...res.task };
      if (p.status === "done") {
        setPlan((xs) => xs.filter((x) => x.id !== t.id));
        setDone((xs) => [updated, ...xs]);
        toast({
          message: res.spawned ? `Done. Next occurrence due ${fmtDate(res.spawned.due_date)}.` : `Done: ${t.title}`,
          tone: "success",
          action: { label: "Undo", onClick: () => patch(updated, { status: t.status }) },
        });
      } else if ("planned_for" in p && p.planned_for !== day) {
        setPlan((xs) => xs.filter((x) => x.id !== t.id));
        if (p.planned_for === null && updated.status !== "done") setPool((xs) => [updated, ...xs]);
        toast({ message: note ?? `Moved: ${t.title}`, action: { label: "Undo", onClick: () => patch(updated, { planned_for: t.planned_for ?? day }) } });
      } else {
        setPlan((xs) => xs.map((x) => (x.id === t.id ? updated : x)));
        if (note) toast({ message: note, tone: "success" });
      }
      invalidateIndex();
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const pull = async (t: TaskRef) => {
    setPool((xs) => xs.filter((x) => x.id !== t.id));
    setPlan((xs) => [...xs, { ...t, planned_for: day }]);
    try {
      await api(`/api/tasks/${t.id}`, "PATCH", { planned_for: day });
      invalidateIndex();
      router.refresh();
    } catch (e) {
      setPlan((xs) => xs.filter((x) => x.id !== t.id));
      setPool((xs) => [t, ...xs]);
      toast({ message: (e as Error).message, tone: "error" });
    }
  };

  const reopen = async (t: TaskRef) => {
    setDone((xs) => xs.filter((x) => x.id !== t.id));
    setPlan((xs) => [...xs, { ...t, status: "todo" }]);
    try {
      await api(`/api/tasks/${t.id}`, "PATCH", { status: "todo", planned_for: day });
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    }
  };

  const shutdown = async () => {
    const leftovers = plan.filter((t) => t.status !== "doing" || isMine(t));
    if (!leftovers.length) {
      toast({ message: "Nothing to carry over. Good day.", tone: "success" });
      return;
    }
    if (!confirm(`Move ${leftovers.length} unfinished task${leftovers.length > 1 ? "s" : ""} to tomorrow?`)) return;
    setBusy("shutdown");
    try {
      await api("/api/tasks", "PATCH", { items: leftovers.map((t) => ({ id: t.id, planned_for: tomorrow })) });
      toast({ message: `${leftovers.length} carried to ${fmtDate(tomorrow)}. ${done.length} finished today.`, tone: "success" });
      invalidateIndex();
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(renderDigestMarkdown({ ...hub, today: plan, doneToday: done }, day));
      toast({ message: "Brief copied as Markdown.", tone: "success" });
    } catch {
      toast({ message: "Clipboard blocked. Open /api/digest instead.", tone: "error" });
    }
  };

  const sortedPlan = useMemo(
    () =>
      [...plan].sort(
        (a, b) =>
          rank(whyToday(a, day)) - rank(whyToday(b, day)) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
      ),
    [plan, day]
  );

  const { cursor, setCursor } = useListKeys(sortedPlan, {
    Enter: (t) => router.push(taskHref(t.id)),
    d: (t) => patch(t, { status: "done" }),
    s: (t) => t.status !== "doing" && patch(t, { status: "doing" }, `Started: ${t.title}`),
    n: (t) => patch(t, { planned_for: tomorrow }, `Moved to tomorrow: ${t.title}`),
    t: (t) => patch(t, { planned_for: null }, `Unplanned: ${t.title}`),
  });

  const dateLabel = new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="mono-label-dim mb-2">{dateLabel}</div>
          <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Today</h1>
          <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
            What you will do today, in order. Plan it in the morning, work the list, and end the day by carrying what is left to tomorrow.
            Keys: j k move, ↵ open, d done, s start, n tomorrow, t unplan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyBrief} className={btnGhost}>Copy brief</button>
          <button onClick={shutdown} disabled={busy === "shutdown"} className={btnGhost} title="Move unfinished planned tasks to tomorrow">
            End the day
          </button>
        </div>
      </header>

      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line mb-6">
          <Stat label="Planned" value={sortedPlan.length} sub={`${plannedPoints} pts`} />
          <Stat label="Capacity" value={capacity} sub="pts per day" editable onChange={saveCapacity} warn={over} />
          <Stat label="Finished today" value={done.length} sub={`${donePoints} pts`} />
          <Link href="/inbox" className="block bg-bg/85 p-4 hover:bg-bg-warm">
            <div className={hub.inbox.length ? "mono-label" : "mono-label-dim"}>Inbox</div>
            <div className="serif-display text-[1.8rem] leading-none mt-2 tnum">{hub.inbox.length}</div>
            <div className="font-mono text-[0.58rem] text-fg-ghost mt-2">{hub.inbox.length ? "to sort →" : "clear"}</div>
          </Link>
        </div>
        <div className="h-[3px] bg-line overflow-hidden mb-2">
          <div className={`h-full ${over ? "bg-fg" : "bg-accent"}`} style={{ width: `${Math.min(100, (plannedPoints / Math.max(1, capacity)) * 100)}%`, transition: "width var(--motion-slow) var(--ease-mythic)" }} />
        </div>
        <p className="font-mono text-[0.6rem] text-fg-ghost mb-6">
          {over
            ? `${plannedPoints} points planned against a capacity of ${capacity}. Move something to tomorrow, or raise the capacity if today is unusual.`
            : plannedPoints
              ? `${plannedPoints} of ${capacity} points planned. ${capacity - plannedPoints} left if something comes up.`
              : "Nothing planned yet. Pull tasks in from below, or capture one with c."}
        </p>

        {sortedPlan.length ? (
          <ul className="border border-line bg-bg/85 divide-y divide-line-soft">
            {sortedPlan.map((t, i) => {
              const why = whyToday(t, day);
              return (
                <li key={t.id} data-cursor={i} className={`flex flex-wrap md:flex-nowrap items-center gap-3 px-4 py-2.5 ${i === cursor ? "bg-[rgba(139,115,85,0.08)]" : ""}`} onMouseEnter={() => setCursor(i)}>
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={busy === t.id}
                    onChange={() => patch(t, { status: "done" })}
                    className="shrink-0"
                    aria-label={`Mark ${t.title} done`}
                  />
                  <span className="font-mono text-[0.55rem] text-accent w-4 shrink-0">{t.priority === "medium" ? "" : PRIORITY_MARK[t.priority]}</span>
                  <Link href={taskHref(t.id)} className="flex-1 min-w-[12rem] text-[0.92rem] text-fg hover:text-accent truncate">
                    {t.title}
                    <span className="font-mono text-[0.58rem] text-fg-ghost">
                      {" · "}
                      <SubLink href={projectHref(t.project_id)}>{t.project_name}</SubLink>
                    </span>
                  </Link>
                  <Chip tone={why === "overdue" || why === "blocked" ? "solid" : why === "doing" ? "accent" : "dim"}>{WHY_LABEL[why]}</Chip>
                  {t.agent && t.agent !== ME ? (
                    <span className="font-mono text-[0.58rem] text-accent shrink-0"><SubLink href={facetHref("agent", t.agent)}>@{t.agent}</SubLink></span>
                  ) : null}
                  {t.due_date ? <span className={`font-mono text-[0.58rem] shrink-0 ${t.due_date < day ? "text-fg" : "text-fg-ghost"}`}>{dueLabel(t.due_date)}</span> : null}
                  <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0 w-10 text-right">{t.estimate ? `${t.estimate} pt` : ""}</span>
                  <span className="flex gap-1 shrink-0">
                    {t.status !== "doing" ? (
                      <button onClick={() => patch(t, { status: "doing" }, `Started: ${t.title}`)} className={btnGhost} title="Start (s)">Start</button>
                    ) : null}
                    <button onClick={() => patch(t, { planned_for: tomorrow }, `Moved to tomorrow: ${t.title}`)} className={btnGhost} title="Tomorrow (n)">→ Tmrw</button>
                    <button onClick={() => patch(t, { planned_for: null }, `Unplanned: ${t.title}`)} className="font-mono text-[0.6rem] text-fg-ghost hover:text-fg px-1" title="Remove from today (t)" aria-label="Remove from today">×</button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-fg-dim text-sm border border-dashed border-line px-4 py-6">
            Your day is empty. Pull in ready work below, press <kbd className="font-mono text-[0.7rem] border border-line px-1">c</kbd> to capture something new, or enjoy it.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-[1.05rem] font-medium text-fg">
            Pull in <span className="ml-2 font-mono text-[0.75rem] text-fg-ghost tnum">{pool.length}</span>
          </h2>
          <button onClick={() => setShowPool((v) => !v)} className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-accent hover:text-fg">
            {showPool ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-fg-ghost text-[0.78rem] mb-3">Ready tasks, yours first. Planning an agent&apos;s task here means you will kick it off or check on it today.</p>
        {showPool ? (
          pool.length ? (
            <ul className="border border-line bg-bg/85 divide-y divide-line-soft">
              {pool.slice(0, 15).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                  <button onClick={() => pull(t)} className={`${btnGhost} shrink-0`} title="Plan for today">+ Today</button>
                  <StatusDot status={t.project_status} />
                  <Link href={taskHref(t.id)} className="flex-1 min-w-0 truncate text-[0.88rem] text-fg hover:text-accent">
                    {t.title}
                    <span className="font-mono text-[0.58rem] text-fg-ghost"> · <SubLink href={projectHref(t.project_id)}>{t.project_name}</SubLink></span>
                  </Link>
                  <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0">
                    {t.agent ? `@${t.agent}` : "unassigned"}
                    {t.due_date ? ` · ${dueLabel(t.due_date)}` : ""}
                    {t.estimate ? ` · ${t.estimate} pt` : ""}
                  </span>
                </li>
              ))}
              {pool.length > 15 ? (
                <li>
                  <Link href="/queue?ready=1" className="block px-4 py-2 font-mono text-[0.58rem] text-fg-ghost hover:text-fg">+ {pool.length - 15} more ready tasks →</Link>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-fg-ghost text-sm">Nothing is ready that isn&apos;t already planned.</p>
          )
        ) : null}
      </section>

      <section>
        <h2 className="text-[1.05rem] font-medium text-fg mb-1">
          Finished today <span className="ml-2 font-mono text-[0.75rem] text-fg-ghost tnum">{done.length}</span>
        </h2>
        <p className="text-fg-ghost text-[0.78rem] mb-3">Everything closed today, by you or an agent.</p>
        {done.length ? (
          <ul className="border border-line bg-bg/85 divide-y divide-line-soft">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                <input type="checkbox" checked readOnly onClick={() => reopen(t)} className="shrink-0" aria-label={`Reopen ${t.title}`} />
                <Link href={taskHref(t.id)} className="flex-1 min-w-0 truncate text-[0.88rem] text-fg-ghost line-through hover:text-accent">{t.title}</Link>
                <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0">
                  {t.agent ? `@${t.agent} · ` : ""}
                  {t.project_name} · {relTime(t.done_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-ghost text-sm">Nothing yet.</p>
        )}
      </section>
    </div>
  );
}

const rank = (w: Why) => ({ doing: 0, overdue: 1, due: 2, carried: 3, planned: 4, blocked: 5 })[w];

function Stat({ label, value, sub, editable, onChange, warn }: { label: string; value: number; sub: string; editable?: boolean; onChange?: (v: number) => void; warn?: boolean }) {
  return (
    <div className="bg-bg/85 p-4">
      <div className={warn ? "mono-label" : "mono-label-dim"}>{label}</div>
      {editable ? (
        <input
          type="number"
          min={1}
          max={100}
          value={value}
          onChange={(e) => onChange?.(Math.max(1, Number(e.target.value) || 1))}
          className="serif-display text-[1.8rem] leading-none mt-2 tnum bg-transparent w-20 outline-none border-b border-transparent focus:border-accent"
          aria-label="Daily capacity in points"
        />
      ) : (
        <div className={`serif-display text-[1.8rem] leading-none mt-2 tnum ${warn ? "text-accent" : ""}`}>{value}</div>
      )}
      <div className="font-mono text-[0.58rem] text-fg-ghost mt-2">{sub}</div>
    </div>
  );
}
