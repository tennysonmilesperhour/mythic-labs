// Flow metrics computed from what the plan already records: done_at,
// claimed_at, estimates. Client-safe; nothing here touches the store.
// Three numbers drive decisions: throughput (what finishes), cycle time (how
// long it takes), and the forecast (when a milestone lands at the current rate).

import {
  DEFAULT_POINTS,
  addDays,
  daysBetween,
  pointsOf,
  today,
  weekStart,
  type Milestone,
  type ProjectDetail,
  type Task,
} from "./projectTypes";

export type WeekBucket = { week: string; tasks: number; points: number; current: boolean };

/** Tasks and points finished per ISO week, oldest first, ending with the current week. */
export function throughputByWeek(details: ProjectDetail[], weeks = 12, day = today()): WeekBucket[] {
  const thisWeek = weekStart(day);
  const buckets = new Map<string, WeekBucket>();
  for (let i = weeks - 1; i >= 0; i--) {
    const w = addDays(thisWeek, -7 * i);
    buckets.set(w, { week: w, tasks: 0, points: 0, current: w === thisWeek });
  }
  for (const d of details) {
    for (const t of d.tasks) {
      if (t.status !== "done" || !t.done_at) continue;
      const b = buckets.get(weekStart(t.done_at.slice(0, 10)));
      if (!b) continue;
      b.tasks++;
      b.points += pointsOf(t);
    }
  }
  return Array.from(buckets.values());
}

export type CycleSample = { id: string; title: string; project_id: string; project_name: string; agent: string | null; days: number; done_at: string; points: number };

/** Calendar days from claim to done, for tasks finished in the window. Unclaimed tasks fall back to creation. */
export function cycleTimes(details: ProjectDetail[], sinceDays = 90, day = today()): CycleSample[] {
  const from = addDays(day, -sinceDays);
  const out: CycleSample[] = [];
  for (const d of details) {
    for (const t of d.tasks) {
      if (t.status !== "done" || !t.done_at || t.done_at.slice(0, 10) < from) continue;
      const start = t.claimed_at ?? t.created_at;
      const days = Math.max(0, (new Date(t.done_at).getTime() - new Date(start).getTime()) / 86_400_000);
      out.push({ id: t.id, title: t.title, project_id: d.project.id, project_name: d.project.name, agent: t.agent, days: Math.round(days * 10) / 10, done_at: t.done_at, points: pointsOf(t) });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

/** Points finished per week over the trailing window (a whole number of weeks, current week excluded when partial). */
export function velocity(tasks: Task[], weeks = 4, day = today()): number {
  const end = weekStart(day); // start of the current (partial) week
  const start = addDays(end, -7 * weeks);
  let pts = 0;
  for (const t of tasks) {
    if (t.status !== "done" || !t.done_at) continue;
    const d = t.done_at.slice(0, 10);
    if (d >= start && d < end) pts += pointsOf(t);
  }
  return pts / weeks;
}

export type Forecast = {
  milestone: Pick<Milestone, "id" | "title" | "target_date" | "done">;
  project_id: string;
  project_name: string;
  open_tasks: number;
  remaining_points: number;
  /** Points per week used for the projection, and where it came from. */
  rate: number;
  rate_source: "project" | "portfolio" | "none";
  weeks_left: number | null;
  projected: string | null;
  /** Positive when the projection lands after the target. */
  slip_days: number | null;
  status: "done" | "on_time" | "late" | "unknown";
};

/** When each open milestone lands at the project's recent rate (or the portfolio's, when the project has none). */
export function forecastMilestones(details: ProjectDetail[], day = today(), weeks = 4): Forecast[] {
  const portfolioRate = velocity(details.flatMap((d) => d.tasks), weeks, day);
  const out: Forecast[] = [];
  for (const d of details) {
    if (d.project.status === "paused") continue;
    const projectRate = velocity(d.tasks, weeks, day);
    for (const m of d.milestones) {
      if (m.done) continue;
      const open = d.tasks.filter((t) => t.milestone_id === m.id && t.status !== "done");
      const remaining = open.reduce((n, t) => n + pointsOf(t), 0);
      const rate = projectRate > 0 ? projectRate : portfolioRate;
      const source: Forecast["rate_source"] = projectRate > 0 ? "project" : portfolioRate > 0 ? "portfolio" : "none";
      const weeksLeft = remaining === 0 ? 0 : rate > 0 ? remaining / rate : null;
      const projected = weeksLeft === null ? null : addDays(day, Math.ceil(weeksLeft * 7));
      const slip = projected && m.target_date ? daysBetween(m.target_date, projected) : null;
      out.push({
        milestone: { id: m.id, title: m.title, target_date: m.target_date, done: m.done },
        project_id: d.project.id,
        project_name: d.project.name,
        open_tasks: open.length,
        remaining_points: remaining,
        rate: Math.round(rate * 10) / 10,
        rate_source: source,
        weeks_left: weeksLeft === null ? null : Math.round(weeksLeft * 10) / 10,
        projected,
        slip_days: slip,
        status: remaining === 0 ? "done" : slip === null ? "unknown" : slip > 0 ? "late" : "on_time",
      });
    }
  }
  return out.sort((a, b) => (a.milestone.target_date ?? "9999").localeCompare(b.milestone.target_date ?? "9999"));
}

export type AgentStat = { agent: string; done: number; points: number; median_days: number | null; blocked_now: number; doing_now: number };

/** What each assignee finished in the window, plus their current load. "unassigned" collects the rest. */
export function byAgent(details: ProjectDetail[], sinceDays = 30, day = today()): AgentStat[] {
  const from = addDays(day, -sinceDays);
  const m = new Map<string, { done: number; points: number; days: number[]; blocked_now: number; doing_now: number }>();
  const get = (a: string | null) => {
    const k = a ?? "unassigned";
    if (!m.has(k)) m.set(k, { done: 0, points: 0, days: [], blocked_now: 0, doing_now: 0 });
    return m.get(k)!;
  };
  for (const d of details) {
    for (const t of d.tasks) {
      const s = get(t.agent);
      if (t.status === "blocked") s.blocked_now++;
      if (t.status === "doing") s.doing_now++;
      if (t.status === "done" && t.done_at && t.done_at.slice(0, 10) >= from) {
        s.done++;
        s.points += pointsOf(t);
        const start = t.claimed_at ?? t.created_at;
        s.days.push(Math.max(0, (new Date(t.done_at).getTime() - new Date(start).getTime()) / 86_400_000));
      }
    }
  }
  return Array.from(m.entries())
    .map(([agent, s]) => ({ agent, done: s.done, points: s.points, median_days: median(s.days.map((x) => Math.round(x * 10) / 10)), blocked_now: s.blocked_now, doing_now: s.doing_now }))
    .filter((s) => s.done || s.doing_now || s.blocked_now)
    .sort((a, b) => b.points - a.points || b.done - a.done);
}

export type ProjectStat = { project_id: string; project_name: string; status: string; done: number; points: number; open_points: number; open_tasks: number; rate: number; weeks_of_work: number | null };

export function byProject(details: ProjectDetail[], sinceDays = 30, day = today()): ProjectStat[] {
  const from = addDays(day, -sinceDays);
  return details
    .filter((d) => d.project.status !== "paused")
    .map((d) => {
      const done = d.tasks.filter((t) => t.status === "done" && t.done_at && t.done_at.slice(0, 10) >= from);
      const open = d.tasks.filter((t) => t.status !== "done");
      const rate = velocity(d.tasks, 4, day);
      const openPoints = open.reduce((n, t) => n + pointsOf(t), 0);
      return {
        project_id: d.project.id,
        project_name: d.project.name,
        status: d.project.status,
        done: done.length,
        points: done.reduce((n, t) => n + pointsOf(t), 0),
        open_points: openPoints,
        open_tasks: open.length,
        rate: Math.round(rate * 10) / 10,
        weeks_of_work: rate > 0 ? Math.round((openPoints / rate) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.points - a.points || b.open_points - a.open_points);
}

export type AgingRow = { id: string; title: string; project_id: string; project_name: string; agent: string | null; days: number; status: "doing" | "blocked" };

/** Work that is open and claimed, oldest first: where the flow is stuck. */
export function aging(details: ProjectDetail[], now = Date.now()): AgingRow[] {
  const out: AgingRow[] = [];
  for (const d of details) {
    if (d.project.status === "paused") continue;
    for (const t of d.tasks) {
      if (t.status !== "doing" && t.status !== "blocked") continue;
      const since = t.status === "doing" ? t.claimed_at ?? t.updated_at : t.updated_at;
      out.push({ id: t.id, title: t.title, project_id: d.project.id, project_name: d.project.name, agent: t.agent, days: Math.round(((now - new Date(since).getTime()) / 86_400_000) * 10) / 10, status: t.status });
    }
  }
  return out.sort((a, b) => b.days - a.days);
}

/** How much of the open work carries an estimate, so forecasts can be trusted (or not). */
export function estimateCoverage(details: ProjectDetail[]): { open: number; estimated: number; assumed_points: number } {
  const open = details.filter((d) => d.project.status !== "paused").flatMap((d) => d.tasks.filter((t) => t.status !== "done"));
  const estimated = open.filter((t) => t.estimate !== null).length;
  return { open: open.length, estimated, assumed_points: (open.length - estimated) * DEFAULT_POINTS };
}
