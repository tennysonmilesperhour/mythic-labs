"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AgentStat, AgingRow, CycleSample, Forecast, ProjectStat, WeekBucket } from "@/lib/insights";
import { median, percentile } from "@/lib/insights";
import { fmtDate } from "@/lib/projectTypes";
import { facetHref, projectHref, taskHref } from "@/lib/taskMap";
import { Chip } from "@/components/ProjectBits";
import SubLink from "@/components/SubLink";

type Props = {
  day: string;
  weeks: WeekBucket[];
  cycles: CycleSample[];
  forecasts: Forecast[];
  agents: AgentStat[];
  projects: ProjectStat[];
  aging: AgingRow[];
  coverage: { open: number; estimated: number; assumed_points: number };
};

// Marks use the accent hue; the current period is emphasized, the rest sit a step back.
const MARK = "rgb(var(--accent-rgb))";
const MARK_DIM = "rgb(var(--accent-rgb) / 0.45)";
const INK_MUTED = "rgb(var(--fg-ghost-rgb))";
const GRID = "var(--hairline)";

export default function InsightsClient({ weeks, cycles, forecasts, agents, projects, aging, coverage }: Props) {
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];
  const cycleDays = cycles.map((c) => c.days);
  const med = median(cycleDays);
  const p85 = percentile(cycleDays, 85);
  const fourWeekAvg = weeks.slice(-5, -1).reduce((n, w) => n + w.points, 0) / Math.max(1, Math.min(4, weeks.length - 1));
  const late = forecasts.filter((f) => f.status === "late");

  return (
    <div className="flex flex-col gap-14">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
        <Tile label="Finished this week" value={thisWeek?.tasks ?? 0} unit="tasks" delta={lastWeek ? thisWeek.tasks - lastWeek.tasks : null} deltaLabel="vs last week" spark={weeks.map((w) => w.tasks)} />
        <Tile label="Points this week" value={thisWeek?.points ?? 0} unit="pts" delta={lastWeek ? thisWeek.points - lastWeek.points : null} deltaLabel="vs last week" spark={weeks.map((w) => w.points)} />
        <Tile label="Median cycle time" value={med === null ? "none" : `${med}d`} unit={p85 === null ? "" : `85% within ${p85}d`} note={`${cycles.length} finished in 90d`} />
        <Tile label="4-week rate" value={`${Math.round(fourWeekAvg * 10) / 10}`} unit="pts per week" note={late.length ? `${late.length} milestone${late.length > 1 ? "s" : ""} projected late` : "no milestone projected late"} warn={late.length > 0} />
      </div>

      {/* Throughput */}
      <Section title="Throughput" what="Points finished per week for the last twelve weeks. Unestimated tasks count as two points. The current week is still in progress.">
        <Columns data={weeks.map((w) => ({ label: w.week.slice(5), value: w.points, current: w.current, detail: `${w.tasks} task${w.tasks === 1 ? "" : "s"} · ${w.points} pts · week of ${fmtDate(w.week)}` }))} />
        <DataTable
          head={["Week", "Tasks", "Points"]}
          rows={weeks.map((w) => [fmtDate(w.week), w.tasks, w.points])}
        />
      </Section>

      {/* Cycle time */}
      <Section title="Cycle time" what="Days from claim to done for every task finished in the last 90 days, one dot each. The line is the median; the shaded band is where 85 percent land.">
        {cycles.length ? (
          <DotStrip samples={cycles} median={med!} p85={p85!} />
        ) : (
          <p className="text-fg-ghost text-sm">No finished tasks in the last 90 days yet.</p>
        )}
        <DataTable
          head={["Task", "Project", "Assignee", "Days", "Done"]}
          rows={cycles.slice(0, 40).map((c) => [c.title, c.project_name, c.agent ? `@${c.agent}` : "unassigned", c.days, fmtDate(c.done_at)])}
        />
      </Section>

      {/* Forecast */}
      <Section
        title="Milestone forecast"
        what={`Remaining points divided by the project's rate over the last four full weeks (or the portfolio rate when a project has not finished anything yet). ${coverage.open - coverage.estimated} of ${coverage.open} open tasks are unestimated, so ${coverage.assumed_points} of the points below are assumed.`}
      >
        {forecasts.length ? (
          <div className="border border-line bg-bg/85 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Milestone", "Project", "Open", "Left", "Rate", "Projected", "Target", "Verdict"].map((h) => (
                    <th key={h} className="mono-label-dim font-normal px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f) => (
                  <tr key={f.milestone.id} className="border-b border-line last:border-0 hover:bg-[rgba(139,115,85,0.04)]">
                    <td className="px-3 py-2 text-[0.88rem] text-fg">
                      <Link href={projectHref(f.project_id, "plan")} className="hover:text-accent">{f.milestone.title}</Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-[0.62rem] text-fg-dim"><Link href={projectHref(f.project_id)} className="hover:text-accent">{f.project_name}</Link></td>
                    <td className="px-3 py-2 font-mono text-[0.62rem] text-fg-dim tnum">{f.open_tasks}</td>
                    <td className="px-3 py-2 font-mono text-[0.62rem] text-fg-dim tnum">{f.remaining_points} pts</td>
                    <td className="px-3 py-2 font-mono text-[0.62rem] text-fg-dim tnum" title={f.rate_source === "portfolio" ? "No finished work in this project yet; using the portfolio rate" : f.rate_source === "none" ? "Nothing finished anywhere in four weeks" : "This project's rate"}>
                      {f.rate ? `${f.rate}/wk` : "none"}{f.rate_source === "portfolio" ? "*" : ""}
                    </td>
                    <td className="px-3 py-2 font-mono text-[0.62rem] text-fg tnum">{f.projected ? fmtDate(f.projected) : "unknown"}{f.weeks_left !== null && f.weeks_left > 0 ? <span className="text-fg-ghost"> · {f.weeks_left}w</span> : null}</td>
                    <td className="px-3 py-2 font-mono text-[0.62rem] text-fg-dim tnum">{f.milestone.target_date ? fmtDate(f.milestone.target_date) : "no target"}</td>
                    <td className="px-3 py-2">
                      {f.status === "late" ? (
                        <Chip tone="solid">▲ {f.slip_days}d late</Chip>
                      ) : f.status === "on_time" ? (
                        <Chip tone="accent">● {f.slip_days === 0 ? "on the day" : `${-f.slip_days!}d early`}</Chip>
                      ) : f.status === "done" ? (
                        <Chip>✓ nothing left</Chip>
                      ) : (
                        <Chip>? no rate</Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 font-mono text-[0.55rem] text-fg-ghost border-t border-line">* portfolio rate, because the project has not finished anything in four weeks.</p>
          </div>
        ) : (
          <p className="text-fg-ghost text-sm">No open milestones to forecast.</p>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-14">
        {/* Agents */}
        <Section title="By assignee, last 30 days" what="Points finished per assignee, largest first, with current load. Cycle time is the median for that assignee.">
          {agents.length ? (
            <>
              <Bars data={agents.map((a) => ({ label: a.agent === "unassigned" ? "unassigned" : `@${a.agent}`, value: a.points, href: a.agent === "unassigned" ? "/queue?unassigned=1" : a.agent === "me" ? "/tasks" : facetHref("agent", a.agent), detail: `${a.done} task${a.done === 1 ? "" : "s"} · ${a.points} pts${a.median_days !== null ? ` · median ${a.median_days}d` : ""}` }))} unit="pts" />
              <DataTable head={["Assignee", "Done", "Points", "Median days", "Doing now", "Blocked now"]} rows={agents.map((a) => [a.agent, a.done, a.points, a.median_days ?? "none", a.doing_now, a.blocked_now])} />
            </>
          ) : (
            <p className="text-fg-ghost text-sm">Nothing finished in the last 30 days.</p>
          )}
        </Section>

        {/* Projects */}
        <Section title="By project, last 30 days" what="Points finished per live project, and how many weeks of open work remain at each project's rate.">
          {projects.length ? (
            <>
              <Bars data={projects.map((p) => ({ label: p.project_name, value: p.points, href: projectHref(p.project_id), detail: `${p.done} done · ${p.open_tasks} open (${p.open_points} pts)${p.weeks_of_work !== null ? ` · ${p.weeks_of_work}w of work left` : ""}` }))} unit="pts" />
              <DataTable head={["Project", "Done", "Points", "Open tasks", "Open points", "Rate", "Weeks left"]} rows={projects.map((p) => [p.project_name, p.done, p.points, p.open_tasks, p.open_points, p.rate, p.weeks_of_work ?? "none"])} />
            </>
          ) : (
            <p className="text-fg-ghost text-sm">No live projects.</p>
          )}
        </Section>
      </div>

      {/* Aging */}
      <Section title="Where work is sitting" what="Open tasks that are claimed or blocked, oldest first. The longer a task sits here, the more likely it needs a decision or a split.">
        {aging.length ? (
          <ul className="border border-line bg-bg/85 divide-y divide-line-soft">
            {aging.slice(0, 12).map((r) => (
              <li key={r.id}>
                <Link href={taskHref(r.id, r.status === "blocked" ? "blocked" : "stalled")} className="flex items-center gap-3 px-4 py-2 hover:bg-[rgba(139,115,85,0.05)]">
                  <span className="flex-1 min-w-0 truncate text-[0.88rem] text-fg">
                    {r.title}
                    <span className="font-mono text-[0.58rem] text-fg-ghost"> · <SubLink href={projectHref(r.project_id)}>{r.project_name}</SubLink></span>
                  </span>
                  {r.agent ? <span className="font-mono text-[0.58rem] text-accent shrink-0">@{r.agent}</span> : null}
                  <Chip tone={r.status === "blocked" ? "solid" : "accent"}>{r.status}</Chip>
                  <span className={`font-mono text-[0.62rem] tnum w-12 text-right ${r.days >= 7 ? "text-fg" : "text-fg-ghost"}`}>{r.days}d</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-ghost text-sm">Nothing is claimed or blocked right now.</p>
        )}
      </Section>
    </div>
  );
}

// ─────────── pieces ───────────

function Section({ title, what, children }: { title: string; what: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[1.05rem] font-medium text-fg mb-1">{title}</h2>
      <p className="text-fg-ghost text-[0.78rem] leading-relaxed mb-4 max-w-3xl">{what}</p>
      {children}
    </section>
  );
}

function Tile({ label, value, unit, delta, deltaLabel, spark, note, warn }: { label: string; value: number | string; unit?: string; delta?: number | null; deltaLabel?: string; spark?: number[]; note?: string; warn?: boolean }) {
  const max = spark ? Math.max(1, ...spark) : 1;
  return (
    <div className="bg-bg/85 p-4">
      <div className={warn ? "mono-label" : "mono-label-dim"}>{label}</div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="font-body font-medium text-[2rem] leading-none text-fg">{value}</span>
        {unit ? <span className="font-mono text-[0.58rem] text-fg-ghost">{unit}</span> : null}
      </div>
      {delta !== null && delta !== undefined ? (
        <div className={`font-mono text-[0.58rem] mt-2 ${delta > 0 ? "text-accent" : delta < 0 ? "text-fg" : "text-fg-ghost"}`}>
          {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "= "}
          {delta} {deltaLabel}
        </div>
      ) : note ? (
        <div className="font-mono text-[0.58rem] text-fg-ghost mt-2">{note}</div>
      ) : null}
      {spark && spark.length > 1 ? (
        <svg viewBox={`0 0 ${spark.length * 10} 24`} className="w-full h-6 mt-2" aria-hidden="true">
          {spark.map((v, i) => (
            <rect key={i} x={i * 10 + 2} y={24 - (v / max) * 22} width={6} height={(v / max) * 22} fill={i === spark.length - 1 ? MARK : MARK_DIM} rx={1} />
          ))}
        </svg>
      ) : null}
    </div>
  );
}

type Hover = { x: number; y: number; text: string } | null;

function Tooltip({ h }: { h: Hover }) {
  if (!h) return null;
  return (
    <div className="pointer-events-none absolute z-10 glass border border-line px-2 py-1 font-mono text-[0.6rem] text-fg whitespace-nowrap" style={{ left: h.x + 10, top: h.y - 28 }}>
      {h.text}
    </div>
  );
}

/** Weekly columns: thin marks, rounded caps, baseline square, the current week emphasized. */
function Columns({ data }: { data: Array<{ label: string; value: number; current: boolean; detail: string }> }) {
  const [hover, setHover] = useState<Hover>(null);
  const W = 720;
  const H = 180;
  const pad = { l: 28, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const slot = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(24, slot * 0.5);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Points finished per week">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill={INK_MUTED} fontFamily="JetBrains Mono, monospace">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          const top = y(d.value);
          const h = Math.max(0, y(0) - top);
          const r = Math.min(4, h / 2);
          return (
            <g key={d.label}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ x: e.clientX - box.left, y: e.clientY - box.top, text: d.detail });
              }} />
              {h > 0 ? (
                <path d={`M${x},${y(0)} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`} fill={d.current ? MARK : MARK_DIM} />
              ) : null}
              {d.current || i === data.length - 2 ? (
                <text x={x + bw / 2} y={top - 4} textAnchor="middle" fontSize={9} fill={INK_MUTED} fontFamily="JetBrains Mono, monospace">{d.value}</text>
              ) : null}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={8} fill={INK_MUTED} fontFamily="JetBrains Mono, monospace">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <Tooltip h={hover} />
    </div>
  );
}

/** One dot per finished task along a days axis; median line and 85th-percentile band. */
function DotStrip({ samples, median: med, p85 }: { samples: CycleSample[]; median: number; p85: number }) {
  const [hover, setHover] = useState<Hover>(null);
  const W = 720;
  const H = 110;
  const pad = { l: 12, r: 12, t: 14, b: 26 };
  const max = niceMax(Math.max(1, ...samples.map((s) => s.days)));
  const x = (d: number) => pad.l + ((W - pad.l - pad.r) * d) / max;
  // Stack dots that share an x so they stay visible.
  const lanes = useMemo(() => {
    const seen = new Map<number, number>();
    return samples.map((s) => {
      const k = Math.round(x(s.days) / 10);
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, max]);
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cycle time per finished task">
        <rect x={x(0)} y={pad.t} width={x(p85) - x(0)} height={H - pad.t - pad.b} fill="rgb(var(--accent-rgb) / 0.08)" />
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke={GRID} />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize={9} fill={INK_MUTED} fontFamily="JetBrains Mono, monospace">{Math.round(t * 10) / 10}d</text>
        ))}
        <line x1={x(med)} x2={x(med)} y1={pad.t - 4} y2={H - pad.b} stroke={MARK} strokeWidth={2} />
        <text x={x(med) + 4} y={pad.t + 2} fontSize={9} fill={INK_MUTED} fontFamily="JetBrains Mono, monospace">median {med}d</text>
        {samples.map((s, i) => {
          const cy = H - pad.b - 10 - lanes[i] * 11;
          return (
            <circle
              key={s.id}
              cx={x(s.days)}
              cy={Math.max(pad.t + 6, cy)}
              r={5}
              fill={MARK}
              stroke="rgb(var(--bg-rgb))"
              strokeWidth={2}
              onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ x: e.clientX - box.left, y: e.clientY - box.top, text: `${s.title} · ${s.days}d · ${s.agent ? `@${s.agent}` : "unassigned"}` });
              }}
            />
          );
        })}
      </svg>
      <Tooltip h={hover} />
    </div>
  );
}

/** Ranked horizontal bars, one hue, value at the tip. */
function Bars({ data, unit }: { data: Array<{ label: string; value: number; href: string; detail: string }>; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-2">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-3" title={d.detail}>
          <Link href={d.href} className="font-mono text-[0.62rem] text-fg-dim w-28 shrink-0 truncate hover:text-accent">{d.label}</Link>
          <div className="flex-1 h-[14px] relative">
            <div className="absolute inset-y-0 left-0 bg-accent rounded-r-[4px]" style={{ width: `${(d.value / max) * 100}%`, transition: "width var(--motion-slow) var(--ease-mythic)" }} />
          </div>
          <span className="font-mono text-[0.62rem] text-fg tnum w-14 text-right">{d.value} {unit}</span>
        </li>
      ))}
    </ul>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  if (!rows.length) return null;
  return (
    <details className="mt-3">
      <summary className="mono-label-dim cursor-pointer">Table view</summary>
      <div className="mt-2 border border-line bg-bg/85 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line">
              {head.map((h) => (
                <th key={h} className="mono-label-dim font-normal px-3 py-1.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {r.map((c, j) => (
                  <td key={j} className={`px-3 py-1.5 text-[0.78rem] ${typeof c === "number" ? "font-mono tnum text-fg-dim" : "text-fg"}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function niceMax(v: number): number {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}
