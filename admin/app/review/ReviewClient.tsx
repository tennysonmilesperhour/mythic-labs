"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  HEALTH_LEVELS,
  HEALTH_META,
  STATUS_META,
  fmtDate,
  relTime,
  today,
  type AttentionItem,
  type Health,
  type HealthLevel,
  type ProjectStats,
  type ProjectSummary,
} from "@/lib/projectTypes";
import { attentionHref, projectHref } from "@/lib/taskMap";
import { Chip, StatusDot, api, btnGhost, btnPrimary, inputCls } from "@/components/ProjectBits";
import { HealthChip } from "@/components/HealthChip";
import { useToast } from "@/components/Toast";

export type ReviewProject = {
  project: ProjectSummary;
  stats: ProjectStats;
  health: Health;
  attention: AttentionItem[];
  milestones: Array<{ id: string; title: string; target_date: string | null; late: boolean }>;
  sinceReview: { days: number; done: number; changes: number; decisions: number };
  update: { health: HealthLevel | null; title: string; body: string; at: string } | null;
  due: boolean;
  ready: string[];
};

type Checklist = { inbox: number; overdue: number; decisions: number; blocked: number; stale: number };

export default function ReviewClient({ rows, startId, checklist }: { rows: ReviewProject[]; startId: string | null; checklist: Checklist }) {
  const router = useRouter();
  const { toast } = useToast();
  const [list, setList] = useState(rows);
  useEffect(() => setList(rows), [rows]);
  // The current project is tracked by id: a refresh may reorder the list (reviewed projects sink), and the card must not jump.
  const [curId, setCurId] = useState<string | null>(() => (rows.some((r) => r.project.id === startId) ? startId : rows[0]?.project.id ?? null));
  const [nextAction, setNextAction] = useState("");
  const [showUpdate, setShowUpdate] = useState(false);
  const [health, setHealth] = useState<HealthLevel>("on_track");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const i = list.findIndex((r) => r.project.id === curId);
  const cur = i >= 0 ? list[i] : undefined;
  const reviewedThisWeek = list.filter((r) => !r.due).length;

  // Reset the form when the card changes project, and only then: a refresh mid-edit keeps what was typed.
  useEffect(() => {
    if (!cur) return;
    setNextAction(cur.project.next_action);
    setShowUpdate(false);
    setHealth(cur.health.level === "paused" || cur.health.level === "idle" ? "on_track" : cur.health.level);
    const s = cur.sinceReview;
    setBody(`Since the last review (${s.days}d): ${s.done} task${s.done === 1 ? "" : "s"} done, ${s.changes} change${s.changes === 1 ? "" : "s"} logged, ${s.decisions} decision${s.decisions === 1 ? "" : "s"}.${cur.project.next_action ? ` Next: ${cur.project.next_action}.` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.project.id]);

  // The pass walks the projects still due; the sidebar reaches any project.
  const advance = () => {
    const next = list.slice(i + 1).find((r) => r.due) ?? list.slice(0, Math.max(i, 0)).find((r) => r.due);
    setCurId(next?.project.id ?? null);
  };
  const goTo = (idx: number) => setCurId(list[idx]?.project.id ?? null);

  const markReviewed = async () => {
    if (!cur) return;
    setBusy(true);
    try {
      // One request, one commit: the reviewed stamp, the next action and the update land together or not at all.
      await api(`/api/projects/${cur.project.id}/review`, "POST", {
        ...(nextAction.trim() !== cur.project.next_action ? { next_action: nextAction.trim() } : {}),
        ...(showUpdate && body.trim() ? { update: { health, body: body.trim() } } : {}),
      });
      setList((xs) => xs.map((r) => (r.project.id === cur.project.id ? { ...r, due: false, project: { ...r.project, next_action: nextAction.trim(), last_reviewed_at: new Date().toISOString() } } : r)));
      toast({ message: `${cur.project.name} reviewed.`, tone: "success" });
      advance();
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: ProjectSummary["status"]) => {
    if (!cur) return;
    setBusy(true);
    try {
      await api(`/api/projects/${cur.project.id}/review`, "POST", { status, status_note: "Changed during review" });
      toast({ message: `${cur.project.name} is now ${STATUS_META[status].label.toLowerCase()}.`, tone: "success" });
      setList((xs) => xs.map((r) => (r.project.id === cur.project.id ? { ...r, due: false, project: { ...r.project, status } } : r)));
      advance();
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const items = useMemo(
    () => [
      { label: "Inbox to zero", n: checklist.inbox, href: "/inbox" },
      { label: "Overdue tasks", n: checklist.overdue, href: "/queue?overdue=1&awake=1" },
      { label: "Blocked tasks", n: checklist.blocked, href: "/queue?status=blocked&awake=1" },
      { label: "Decisions waiting on you", n: checklist.decisions, href: "/tasks" },
      { label: "Quiet projects", n: checklist.stale, href: "/fix?key=group:stale" },
    ],
    [checklist]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-12">
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <span className="mono-label-dim">
            {cur ? i + 1 : list.length} of {list.length} · {reviewedThisWeek} reviewed this week
          </span>
          <div className="flex gap-1">
            {list.map((r, idx) => (
              <button
                key={r.project.id}
                onClick={() => goTo(idx)}
                title={r.project.name}
                className={`h-1.5 w-4 ${idx === i ? "bg-accent" : r.due ? "bg-line" : "bg-accent-light"}`}
              />
            ))}
          </div>
        </div>

        {!cur ? (
          <div className="border border-accent bg-[rgba(139,115,85,0.06)] p-8 glow-anchor">
            <div className="serif-display text-[1.8rem] mb-2">Review complete</div>
            <p className="text-fg-dim text-sm mb-4">Every project has a fresh next action and a reviewed stamp. Plan the week from <Link href="/today" className="text-accent hover:text-fg">Today →</Link></p>
            <button onClick={() => goTo(0)} className={btnGhost}>Start over</button>
          </div>
        ) : (
          <article className="border border-line bg-bg/85 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                <Link href={projectHref(cur.project.id)} className="serif-display text-[2rem] leading-tight text-fg hover:text-accent">
                  {cur.project.name}
                </Link>
                <div className="flex flex-wrap items-center gap-2 mt-2 font-mono text-[0.6rem] text-fg-dim">
                  <StatusDot status={cur.project.status} /> {STATUS_META[cur.project.status].label} · {cur.project.priority}
                  <HealthChip health={cur.health} />
                  <span className="text-fg-ghost">
                    {cur.project.last_reviewed_at ? `reviewed ${relTime(cur.project.last_reviewed_at)}` : "never reviewed"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-px bg-line border border-line text-center">
                {[
                  ["done", cur.sinceReview.done],
                  ["ready", cur.stats.ready],
                  ["blocked", cur.stats.blocked],
                  ["overdue", cur.stats.overdue],
                ].map(([k, v]) => (
                  <div key={k as string} className="bg-bg px-3 py-2">
                    <div className="mono-label-dim">{k}</div>
                    <div className={`serif-display text-[1.3rem] tnum ${(k === "blocked" || k === "overdue") && Number(v) > 0 ? "text-accent" : ""}`}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            {cur.project.summary ? <p className="text-fg-dim text-[0.9rem] leading-relaxed mb-5 max-w-2xl">{cur.project.summary}</p> : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <div className="mono-label mb-2">Next action</div>
                <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="The very next thing to do" className={inputCls} />
                {cur.ready.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cur.ready.map((t) => (
                      <button key={t} onClick={() => setNextAction(t)} className="font-mono text-[0.58rem] px-1.5 py-0.5 border border-line text-fg-dim hover:text-accent hover:border-accent">
                        {t}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="mono-label-dim mb-2">Open milestones</div>
                {cur.milestones.length ? (
                  <ul className="flex flex-col">
                    {cur.milestones.slice(0, 4).map((m) => (
                      <li key={m.id} className="flex items-baseline gap-3 py-1 border-b border-line text-[0.85rem]">
                        <Link href={projectHref(cur.project.id, "plan")} className="flex-1 min-w-0 truncate hover:text-accent">{m.title}</Link>
                        <span className={`font-mono text-[0.58rem] ${m.late ? "text-fg" : "text-fg-ghost"}`}>{m.target_date ? fmtDate(m.target_date) : "no date"}{m.late ? " · late" : ""}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-fg-ghost text-sm">No open milestones. <Link href={projectHref(cur.project.id, "plan")} className="text-accent hover:text-fg">Add one →</Link></p>
                )}
              </div>
            </div>

            {cur.attention.length ? (
              <div className="mb-6">
                <div className="mono-label-dim mb-2">Needs attention</div>
                <ul className="flex flex-col">
                  {cur.attention.slice(0, 6).map((a) => (
                    <li key={a.key}>
                      <Link href={attentionHref(a)} className="flex items-baseline gap-3 py-1 border-b border-line text-[0.85rem] hover:text-accent">
                        <span className={`font-mono text-[0.6rem] ${a.severity === "high" ? "text-fg" : "text-accent"}`}>{a.severity === "high" ? "■" : "◆"}</span>
                        <span className="flex-1 min-w-0 truncate">{a.title}</span>
                        <span className="font-mono text-[0.58rem] text-fg-ghost">{a.detail}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-2">
                <div className="mono-label-dim">Status update</div>
                <button onClick={() => setShowUpdate((v) => !v)} className="font-mono text-[0.6rem] text-accent hover:text-fg">
                  {showUpdate ? "Skip the update" : "Write an update"}
                </button>
              </div>
              {cur.update ? (
                <p className="text-[0.85rem] text-fg-dim mb-2">
                  Last update {relTime(cur.update.at)}{cur.update.health ? `, ${HEALTH_META[cur.update.health].label.toLowerCase()}` : ""}: <span className="text-fg">{cur.update.body || cur.update.title}</span>
                </p>
              ) : (
                <p className="text-[0.85rem] text-fg-ghost mb-2">No written update yet. A line a week is enough.</p>
              )}
              {showUpdate ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1">
                    {HEALTH_LEVELS.filter((h) => h !== "paused" && h !== "idle").map((h) => (
                      <button key={h} onClick={() => setHealth(h)} className={`font-mono text-[0.6rem] uppercase tracking-[0.15em] px-2 py-1 border ${health === h ? "bg-fg text-bg border-fg" : "border-line text-fg-dim hover:text-fg"}`}>
                        {HEALTH_META[h].label}
                      </button>
                    ))}
                    <span className="font-mono text-[0.58rem] text-fg-ghost self-center ml-2">computed: {HEALTH_META[cur.health.level].label.toLowerCase()}{cur.health.reasons.length ? ` (${cur.health.reasons.join(", ")})` : ""}</span>
                  </div>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={inputCls} />
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <button onClick={markReviewed} disabled={busy} className={btnPrimary}>
                {showUpdate ? "Post update and mark reviewed" : "Mark reviewed"}
              </button>
              <button onClick={advance} className={btnGhost}>Skip</button>
              {cur.project.status !== "paused" ? (
                <button onClick={() => setStatus("paused")} disabled={busy} className={btnGhost}>Pause it</button>
              ) : (
                <button onClick={() => setStatus("active")} disabled={busy} className={btnGhost}>Revive it</button>
              )}
              <Link href={projectHref(cur.project.id, "plan")} className={`${btnGhost} ml-auto`}>Open plan →</Link>
            </div>
          </article>
        )}
      </div>

      <aside className="flex flex-col gap-8">
        <section>
          <div className="hairline-accent-sm mb-3"><span className="mono-label">Get clear</span></div>
          <ul className="flex flex-col">
            {items.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-baseline gap-3 py-1.5 border-b border-line text-[0.85rem] hover:text-accent">
                  <span className={`font-mono text-[0.6rem] ${c.n ? "text-fg" : "text-accent"}`}>{c.n ? "○" : "✓"}</span>
                  <span className="flex-1 min-w-0">{c.label}</span>
                  <span className="font-mono text-[0.6rem] text-fg-ghost tnum">{c.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className="hairline-accent-sm mb-3"><span className="mono-label">Projects</span></div>
          <ul className="flex flex-col">
            {list.map((r, idx) => (
              <li key={r.project.id}>
                <button onClick={() => goTo(idx)} className={`w-full flex items-baseline gap-2 py-1 text-left text-[0.82rem] hover:text-accent ${idx === i ? "text-fg" : "text-fg-dim"}`}>
                  <span className={`font-mono text-[0.55rem] ${r.due ? "text-fg-ghost" : "text-accent"}`}>{r.due ? "○" : "✓"}</span>
                  <span className="flex-1 min-w-0 truncate">{r.project.name}</span>
                  {r.project.status === "paused" ? <Chip>paused</Chip> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className="hairline-accent-sm mb-3"><span className="mono-label">Then</span></div>
          <p className="text-[0.82rem] text-fg-dim leading-relaxed">
            Plan the week from <Link href="/today" className="text-accent hover:text-fg">Today</Link>, and check <Link href="/insights" className="text-accent hover:text-fg">Insights</Link> for how last week went.
          </p>
        </section>
      </aside>
    </div>
  );
}
