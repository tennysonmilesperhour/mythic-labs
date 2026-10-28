// Client-safe types, constants and logic for the project manager: readiness,
// the attention engine, and the Markdown roadmap that agents read.
// Reads and writes live in projects.ts (server-only), stored via store.ts.

export const STATUSES = ["active", "building", "planned", "paused"] as const;
export type ProjectStatus = (typeof STATUSES)[number];

export const STATUS_META: Record<
  ProjectStatus,
  { label: string; hint: string; dot: string }
> = {
  active: { label: "Active", hint: "Live and being worked on", dot: "#8b7355" },
  building: { label: "Building", hint: "Under construction, not live yet", dot: "#c4a882" },
  planned: { label: "Planned", hint: "Scoped, not started", dot: "#a09a94" },
  paused: { label: "Paused", hint: "On hold", dot: "#d8d2c8" },
};

// Projects agents may pick work from.
export const WORKABLE: ProjectStatus[] = ["active", "building"];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK: Record<ProjectStatus, number> = { active: 0, building: 1, planned: 2, paused: 3 };

export const TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CHANGE_TYPES = ["added", "changed", "fixed", "removed", "security"] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const DECISION_STATUSES = ["proposed", "accepted", "superseded", "rejected"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type EntryKind = "changelog" | "decision" | "note" | "status" | "progress";

// Suggestions only; every tag input also accepts free text.
export const AGENT_PRESETS = [
  "me",
  "claude-code",
  "claude-cowork",
  "archetypal-analyst",
  "code-review",
  "Explore",
  "Plan",
  "general-purpose",
];

export const TOOL_PRESETS = [
  "GitHub",
  "Vercel",
  "Supabase",
  "ClickUp",
  "Canva",
  "Claude Docs",
  "Gmail",
  "Google Calendar",
  "Google Drive",
  "Wix",
  "Lucid",
  "Base44",
  "Figma",
  "Stripe",
];

// Thresholds for the attention engine, in days.
export const STALE_DAYS = 14;
export const STALLED_CLAIM_DAYS = 3;
export const LONG_PAUSE_DAYS = 60;
export const SOON_DAYS = 14;

export type ProjectLink = { label: string; url: string };

export type Project = {
  id: string;
  name: string;
  owner: string | null;
  repo: string | null;
  source_key?: string | null;
  status: ProjectStatus;
  priority: Priority;
  summary: string;
  description: string;
  next_action: string;
  agent_instructions: string;
  tags: string[];
  agents: string[];
  tools: string[];
  links: ProjectLink[];
  start_date: string | null;
  target_date: string | null;
  status_changed_at: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Milestone = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  start_date: string | null;
  target_date: string | null;
  done: boolean;
  done_at: string | null;
  sort_order: number;
  created_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  /** Stable identifier for imported tasks; optional for existing/manual tasks. */
  source_key?: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  title: string;
  notes: string;
  acceptance: string;
  depends_on: string[];
  status: TaskStatus;
  priority: Priority;
  agent: string | null;
  due_date: string | null;
  claimed_at: string | null;
  done_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Entry = {
  id: string;
  project_id: string;
  kind: EntryKind;
  title: string;
  body: string;
  entry_date: string;
  author: string | null;
  version: string | null;
  change_type: ChangeType | null;
  source_url: string | null;
  evidence_url: string | null;
  decision_status: DecisionStatus | null;
  context: string;
  alternatives: string;
  consequences: string;
  created_at: string;
};

export type ProjectDetail = {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  entries: Entry[];
};

export type ProjectStats = {
  total: number;
  done: number;
  doing: number;
  blocked: number;
  ready: number;
  overdue: number;
  nextMilestone: { title: string; target_date: string | null } | null;
  lastActivity: string | null;
};

export type Severity = "high" | "medium" | "low";

export type AttentionItem = {
  key: string;
  severity: Severity;
  project_id: string;
  project_name: string;
  title: string;
  detail: string;
  task_id?: string;
  /** Set on grouped items: where to go instead of a single project. */
  href?: string;
};

export type ProjectSummary = Project & { stats: ProjectStats; attention: AttentionItem[] };

export type TimelineItem = Milestone & {
  project_name: string;
  project_status: ProjectStatus;
  tasks_total: number;
  tasks_done: number;
};

export type TaskRef = Task & { project_name: string; project_status: ProjectStatus };

export type Hub = {
  projects: ProjectSummary[];
  timeline: TimelineItem[];
  attention: AttentionItem[];
  inProgress: TaskRef[];
  upcoming: TaskRef[];
};

// ─────────── dates ───────────

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function isOverdue(date: string | null, done: boolean): boolean {
  return !!date && !done && date < today();
}

export function fmtDate(date: string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date.length === 10 ? `${date}T12:00:00` : date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return fmtDate(iso);
}

/** "in 3d", "today", "2d late" for a YYYY-MM-DD date. */
export function dueLabel(date: string | null): string {
  if (!date) return "";
  const n = Math.round(
    (new Date(`${date}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86_400_000
  );
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return n > 0 ? `in ${n}d` : `${-n}d late`;
}

// ─────────── readiness ───────────

/**
 * A task is ready when an agent could start it right now: it's todo, every
 * task it depends on is done, and everything beneath it is done (subtasks
 * are the work; the parent becomes ready for wrap-up once they're finished).
 */
export function isReady(t: Task, all: Task[]): boolean {
  if (t.status !== "todo") return false;
  const byId = new Map(all.map((x) => [x.id, x]));
  if (t.depends_on.some((id) => byId.get(id) && byId.get(id)!.status !== "done")) return false;
  return openDescendants(t, all).length === 0;
}

export function openDescendants(t: Task, all: Task[]): Task[] {
  const out: Task[] = [];
  const walk = (id: string) => {
    for (const x of all) {
      if (x.parent_id !== id) continue;
      if (x.status !== "done") out.push(x);
      walk(x.id);
    }
  };
  walk(t.id);
  return out;
}

export function waitingOn(t: Task, all: Task[]): Task[] {
  const byId = new Map(all.map((x) => [x.id, x]));
  return t.depends_on.map((id) => byId.get(id)).filter((x): x is Task => !!x && x.status !== "done");
}

/** A subtask is as urgent as the most urgent task above it. */
function effectivePriority(t: Task, byId: Map<string, Task>): number {
  let best = PRIORITY_RANK[t.priority];
  let p = t.parent_id ? byId.get(t.parent_id) : undefined;
  while (p) {
    best = Math.min(best, PRIORITY_RANK[p.priority]);
    p = p.parent_id ? byId.get(p.parent_id) : undefined;
  }
  return best;
}

/** Ready tasks in the order an agent should take them. */
export function rankReady(tasks: Task[], milestones: Milestone[]): Task[] {
  const msOrder = new Map(milestones.map((m) => [m.id, m.done ? 999 : m.sort_order]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks
    .filter((t) => isReady(t, tasks))
    .sort(
      (a, b) =>
        effectivePriority(a, byId) - effectivePriority(b, byId) ||
        (msOrder.get(a.milestone_id ?? "") ?? 500) - (msOrder.get(b.milestone_id ?? "") ?? 500) ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
        a.sort_order - b.sort_order ||
        a.created_at.localeCompare(b.created_at)
    );
}

export function taskPath(t: Task, all: Task[]): string {
  const byId = new Map(all.map((x) => [x.id, x]));
  const parts = [t.title];
  let p = t.parent_id ? byId.get(t.parent_id) : undefined;
  while (p) {
    parts.unshift(p.title);
    p = p.parent_id ? byId.get(p.parent_id) : undefined;
  }
  return parts.join(" › ");
}

// ─────────── stats + attention ───────────

export function computeStats(
  tasks: Task[],
  milestones: Milestone[],
  extraTimestamps: string[] = []
): ProjectStats {
  const open = milestones
    .filter((m) => !m.done)
    .sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"));
  const stamps = [...tasks.map((t) => t.updated_at), ...extraTimestamps].filter(Boolean).sort();
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    doing: tasks.filter((t) => t.status === "doing").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    ready: tasks.filter((t) => isReady(t, tasks)).length,
    overdue: tasks.filter((t) => isOverdue(t.due_date, t.status === "done")).length,
    nextMilestone: open[0] ? { title: open[0].title, target_date: open[0].target_date } : null,
    lastActivity: stamps.length ? stamps[stamps.length - 1] : null,
  };
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Everything about one project that wants a human decision or a nudge. */
export function computeAttention(d: ProjectDetail, lastActivity: string | null): AttentionItem[] {
  const { project: p, tasks, milestones, entries } = d;
  const out: AttentionItem[] = [];
  const add = (severity: Severity, key: string, title: string, detail: string, task_id?: string) =>
    out.push({ key: `${p.id}:${key}`, severity, project_id: p.id, project_name: p.name, title, detail, task_id });
  const workable = WORKABLE.includes(p.status);

  for (const t of tasks) {
    if (t.status === "blocked") {
      add("high", `blocked:${t.id}`, `Blocked: ${t.title}`, t.agent ? `@${t.agent}` : "unassigned", t.id);
    } else if (isOverdue(t.due_date, t.status === "done")) {
      add("high", `overdue:${t.id}`, `Overdue: ${t.title}`, `due ${fmtDate(t.due_date)}`, t.id);
    } else if (t.status === "doing" && daysSince(t.updated_at) >= STALLED_CLAIM_DAYS) {
      add("medium", `stalled:${t.id}`, `Stalled: ${t.title}`, `${t.agent ? `@${t.agent}, ` : ""}no update in ${daysSince(t.updated_at)}d`, t.id);
    } else if (t.priority === "critical" && t.status !== "done" && p.status !== "paused") {
      // Critical work is urgent by definition, even before it's late or blocked.
      add("high", `critical:${t.id}`, `Critical: ${t.title}`, t.status === "doing" ? `in progress${t.agent ? `, @${t.agent}` : ""}` : t.agent ? `@${t.agent}` : "unassigned", t.id);
    }
  }
  for (const m of milestones) {
    if (isOverdue(m.target_date, m.done)) {
      add("high", `ms:${m.id}`, `Milestone late: ${m.title}`, `target ${fmtDate(m.target_date)}`);
    }
  }
  if (p.status !== "paused" && isOverdue(p.target_date, false)) {
    add("high", "target", "Past target date", `target was ${fmtDate(p.target_date)}`);
  }
  for (const e of entries) {
    if (e.kind === "decision" && e.decision_status === "proposed") {
      add("medium", `decision:${e.id}`, `Decision needs your call: ${e.title}`, e.author ? `proposed by @${e.author}` : "proposed");
    }
  }
  if (workable) {
    const open = tasks.filter((t) => t.status !== "done");
    if (!open.length) add("medium", "empty", "No open tasks", "plan the next milestone or change status");
    else if (!tasks.some((t) => isReady(t, tasks)) && !tasks.some((t) => t.status === "doing"))
      add("medium", "stuck", "Nothing is ready to work on", "every open task is blocked or waiting on a dependency");
    if (!p.next_action.trim()) add("low", "next", "No next action set", "one line keeps you and the agents pointed");
    if (daysSince(lastActivity) >= STALE_DAYS)
      add("medium", "stale", `Quiet for ${daysSince(lastActivity)}d`, "still active, or should it be paused?");
    if (p.agents.some((a) => a !== "me") && !p.agent_instructions.trim())
      add("low", "instructions", "Agents assigned without build instructions", "add them in Setup");
  }
  if (p.status === "paused" && daysSince(p.status_changed_at) >= LONG_PAUSE_DAYS) {
    add("low", "paused", `Paused for ${daysSince(p.status_changed_at)}d`, "revive it, or leave it be");
  }
  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function sortAttention(items: AttentionItem[], projects: Pick<Project, "id" | "priority" | "status">[]) {
  const order = new Map(sortProjects(projects.map((p) => ({ ...p, sort_order: 0 }))).map((p, i) => [p.id, i]));
  return [...items].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (order.get(a.project_id) ?? 99) - (order.get(b.project_id) ?? 99)
  );
}

/** Live work first (by priority), then planned, then paused. */
// Housekeeping flags that read better as one line when many projects share them.
const GROUPABLE: Record<string, (n: number) => string> = {
  empty: (n) => `${n} active projects have no open tasks`,
  stuck: (n) => `${n} projects have nothing ready to work on`,
  next: (n) => `${n} projects have no next action`,
  stale: (n) => `${n} active projects have gone quiet`,
  instructions: (n) => `${n} projects have agents but no build instructions`,
  paused: (n) => `${n} projects paused 60+ days`,
};

/**
 * Collapse housekeeping flags shared by `min` or more projects into one item,
 * so a fresh import doesn't bury what's actually urgent. Blocked, overdue,
 * stalled and decision flags always stay individual.
 */
export function groupAttention(items: AttentionItem[], min = 3): AttentionItem[] {
  const kind = (a: AttentionItem) => a.key.split(":")[1];
  const counts = new Map<string, AttentionItem[]>();
  for (const a of items) {
    if (GROUPABLE[kind(a)]) counts.set(kind(a), [...(counts.get(kind(a)) || []), a]);
  }
  const out: AttentionItem[] = [];
  const emitted = new Set<string>();
  for (const a of items) {
    const k = kind(a);
    const group = counts.get(k);
    if (!group || group.length < min) {
      out.push(a);
      continue;
    }
    if (emitted.has(k)) continue;
    emitted.add(k);
    const names = group.map((g) => g.project_name);
    out.push({
      key: `group:${k}`,
      severity: a.severity,
      project_id: "",
      project_name: "",
      title: GROUPABLE[k](group.length),
      detail: names.slice(0, 6).join(", ") + (names.length > 6 ? ` +${names.length - 6} more` : ""),
      href: "/projects?view=list",
    });
  }
  return out;
}

export function sortProjects<T extends Pick<Project, "status" | "priority" | "sort_order">>(ps: T[]): T[] {
  const group = (s: ProjectStatus) => (WORKABLE.includes(s) ? 0 : s === "planned" ? 1 : 2);
  return [...ps].sort(
    (a, b) =>
      group(a.status) - group(b.status) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.sort_order - b.sort_order
  );
}

// ─────────── Markdown ───────────

type MdOpts = { ids?: boolean; compact?: boolean };

/**
 * A project as Markdown. With `ids`, task ids are included so an agent can
 * claim and update tasks through the agent API.
 */
export function renderProjectMarkdown(d: ProjectDetail, opts: MdOpts = {}): string {
  const p = d.project;
  const out: string[] = [];
  const tid = (t: Task) => (opts.ids ? ` \`${t.id}\`` : "");
  out.push(`# ${p.name}`, "");
  const meta = [
    `**Status:** ${STATUS_META[p.status].label}`,
    `**Priority:** ${p.priority}`,
    p.owner && p.repo ? `**Repo:** ${p.owner}/${p.repo}` : "",
    p.target_date ? `**Target:** ${p.target_date}` : "",
    opts.ids ? `**Project id:** \`${p.id}\`` : "",
  ].filter(Boolean);
  out.push(meta.join(" · "), "");
  if (p.summary) out.push(p.summary, "");
  if (p.next_action) out.push(`**Next action:** ${p.next_action}`, "");
  if (p.agents.length) out.push(`**Agents:** ${p.agents.join(", ")}`);
  if (p.tools.length) out.push(`**Tools:** ${p.tools.join(", ")}`);
  if (p.tags.length) out.push(`**Tags:** ${p.tags.join(", ")}`);
  if (p.links.length) out.push(`**Links:** ${p.links.map((l) => `[${l.label}](${l.url})`).join(" · ")}`);
  out.push("");
  if (p.description && !opts.compact) out.push("## Overview", "", p.description, "");
  if (p.agent_instructions) out.push("## Build instructions", "", p.agent_instructions, "");

  const ready = rankReady(d.tasks, d.milestones);
  if (ready.length) {
    out.push("## Ready now", "", "In priority order. Take the first one assigned to you, or unassigned.", "");
    for (const t of ready.slice(0, opts.compact ? 5 : 20)) {
      out.push(`- ${taskPath(t, d.tasks)}${t.agent ? ` @${t.agent}` : " (unassigned)"} · ${t.priority}${tid(t)}`);
    }
    out.push("");
  }

  if (opts.compact) return finish(out);

  const kids = (parent: string | null) =>
    d.tasks
      .filter((t) => t.parent_id === parent)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const byId = new Map(d.tasks.map((t) => [t.id, t]));
  const taskLines = (list: Task[], depth: number): string[] =>
    list.flatMap((t) => {
      const pad = "  ".repeat(depth);
      const bits = [t.title];
      if (t.agent) bits.push(`@${t.agent}`);
      if (t.status === "doing" || t.status === "blocked") bits.push(`(${t.status})`);
      if (t.priority !== "medium") bits.push(`[${t.priority}]`);
      if (t.due_date) bits.push(`due ${t.due_date}`);
      const lines = [`${pad}- [${t.status === "done" ? "x" : " "}] ${bits.join(" ")}${tid(t)}`];
      if (t.status !== "done") {
        const deps = t.depends_on.map((id) => byId.get(id)).filter(Boolean) as Task[];
        if (deps.length) lines.push(`${pad}  - after: ${deps.map((x) => x.title).join("; ")}`);
        if (t.acceptance) lines.push(`${pad}  - done when: ${t.acceptance.replace(/\n+/g, " ")}`);
        if (t.notes) lines.push(`${pad}  - notes: ${t.notes.replace(/\n+/g, " ")}`);
      }
      return [...lines, ...taskLines(kids(t.id), depth + 1)];
    });

  out.push("## Plan", "");
  const roots = kids(null);
  for (const m of [...d.milestones].sort((a, b) => a.sort_order - b.sort_order)) {
    const when = [m.start_date, m.target_date].filter(Boolean).join(" → ");
    out.push(`### ${m.done ? "✓ " : ""}${m.title}${when ? ` (${when})` : ""}`, "");
    if (m.description) out.push(m.description, "");
    out.push(...taskLines(roots.filter((t) => t.milestone_id === m.id), 0), "");
  }
  const loose = roots.filter((t) => !t.milestone_id);
  if (loose.length) out.push("### Unscheduled", "", ...taskLines(loose, 0), "");

  const decisions = d.entries.filter((e) => e.kind === "decision");
  if (decisions.length) {
    out.push("## Decisions", "");
    for (const e of decisions) {
      out.push(`### ${e.entry_date} · ${e.title} (${e.decision_status ?? "accepted"})`, "");
      if (e.context) out.push(`**Context:** ${e.context}`, "");
      if (e.body) out.push(`**Decision:** ${e.body}`, "");
      if (e.alternatives) out.push(`**Alternatives:** ${e.alternatives}`, "");
      if (e.consequences) out.push(`**Consequences:** ${e.consequences}`, "");
    }
  }

  const changes = d.entries.filter((e) => e.kind === "changelog");
  if (changes.length) {
    out.push("## Changelog", "");
    for (const e of changes.slice(0, 30)) {
      const head = [e.entry_date, e.version, e.change_type].filter(Boolean).join(" · ");
      out.push(`- **${head}** ${e.title}${e.body ? `: ${e.body}` : ""}`);
    }
    out.push("");
  }

  const progress = d.entries.filter((e) => e.kind === "progress").slice(0, 10);
  if (progress.length) {
    out.push("## Recent progress", "");
    for (const e of progress) out.push(`- ${e.entry_date}${e.author ? ` @${e.author}` : ""}: ${e.title}${e.body ? ` (${e.body})` : ""}`);
    out.push("");
  }
  return finish(out);
}

/** The whole portfolio in one document: what an agent reads to orient. */
export function renderRoadmapMarkdown(details: ProjectDetail[], attention: AttentionItem[], opts: MdOpts = {}): string {
  const out: string[] = ["# Roadmap", "", `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, ""];
  const sorted = sortProjects(details.map((d) => ({ ...d.project, d }))).map((x) => x.d);
  out.push("| Project | Status | Priority | Open | Ready | Next action |", "|---|---|---|---|---|---|");
  for (const d of sorted) {
    const p = d.project;
    const open = d.tasks.filter((t) => t.status !== "done").length;
    const ready = d.tasks.filter((t) => isReady(t, d.tasks)).length;
    out.push(`| ${p.name} | ${STATUS_META[p.status].label} | ${p.priority} | ${open} | ${ready} | ${(p.next_action || "—").replace(/\|/g, "/")} |`);
  }
  out.push("");
  if (attention.length) {
    out.push("## Needs attention", "");
    for (const a of attention.slice(0, 25)) out.push(`- **${a.severity}** · ${a.project_name}: ${a.title} (${a.detail})`);
    out.push("");
  }
  for (const d of sorted.filter((x) => x.project.status !== "paused")) {
    out.push(
      renderProjectMarkdown(d, { ...opts, compact: true })
        .replace(/^# /m, "## ")
        .replace(/^## (Build instructions|Ready now)/gm, "### $1")
    );
  }
  const paused = sorted.filter((x) => x.project.status === "paused");
  if (paused.length) out.push("## Paused", "", ...paused.map((x) => `- ${x.project.name}`), "");
  return finish(out);
}

function finish(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
