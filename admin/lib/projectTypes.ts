// Client-safe types, constants and formatting for the project manager.
// The Supabase queries live in projects.ts (server-only).

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

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CHANGE_TYPES = ["added", "changed", "fixed", "removed", "security"] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const DECISION_STATUSES = ["proposed", "accepted", "superseded", "rejected"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type EntryKind = "changelog" | "decision" | "note" | "status";

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

export type ProjectLink = { label: string; url: string };

export type Project = {
  id: string;
  user_id: string;
  name: string;
  owner: string | null;
  repo: string | null;
  status: ProjectStatus;
  priority: Priority;
  summary: string;
  description: string;
  next_action: string;
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
  milestone_id: string | null;
  parent_id: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  agent: string | null;
  due_date: string | null;
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
  version: string | null;
  change_type: ChangeType | null;
  source_url: string | null;
  decision_status: DecisionStatus | null;
  context: string;
  alternatives: string;
  consequences: string;
  created_at: string;
};

export type ProjectStats = {
  total: number;
  done: number;
  doing: number;
  blocked: number;
  overdue: number;
  nextMilestone: { title: string; target_date: string | null } | null;
  lastActivity: string | null;
};

export type ProjectSummary = Project & { stats: ProjectStats };

export type TimelineItem = Milestone & {
  project_name: string;
  project_status: ProjectStatus;
  tasks_total: number;
  tasks_done: number;
};

export type ProjectDetail = {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  entries: Entry[];
};

// ─────────── helpers ───────────

export function today(): string {
  return new Date().toISOString().slice(0, 10);
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

export function computeStats(
  tasks: Pick<Task, "status" | "due_date" | "updated_at">[],
  milestones: Pick<Milestone, "title" | "target_date" | "done">[],
  extraTimestamps: string[] = []
): ProjectStats {
  const open = milestones
    .filter((m) => !m.done)
    .sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"));
  const stamps = [...tasks.map((t) => t.updated_at), ...extraTimestamps].sort();
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    doing: tasks.filter((t) => t.status === "doing").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    overdue: tasks.filter((t) => isOverdue(t.due_date, t.status === "done")).length,
    nextMilestone: open[0] ? { title: open[0].title, target_date: open[0].target_date } : null,
    lastActivity: stamps.length ? stamps[stamps.length - 1] : null,
  };
}

/**
 * Render a project as Markdown: paste it into a Claude session as context,
 * or commit it to the repo as PROJECT.md.
 */
export function renderProjectMarkdown(d: ProjectDetail): string {
  const p = d.project;
  const out: string[] = [];
  out.push(`# ${p.name}`, "");
  const meta = [
    `**Status:** ${STATUS_META[p.status].label}`,
    `**Priority:** ${p.priority}`,
    p.owner && p.repo ? `**Repo:** ${p.owner}/${p.repo}` : "",
    p.target_date ? `**Target:** ${p.target_date}` : "",
  ].filter(Boolean);
  out.push(meta.join(" · "), "");
  if (p.summary) out.push(p.summary, "");
  if (p.next_action) out.push(`**Next action:** ${p.next_action}`, "");
  if (p.agents.length) out.push(`**Agents:** ${p.agents.join(", ")}`);
  if (p.tools.length) out.push(`**Tools:** ${p.tools.join(", ")}`);
  if (p.tags.length) out.push(`**Tags:** ${p.tags.join(", ")}`);
  if (p.links.length) out.push(`**Links:** ${p.links.map((l) => `[${l.label}](${l.url})`).join(" · ")}`);
  out.push("");
  if (p.description) out.push("## Overview", "", p.description, "");

  const kids = (parent: string | null) =>
    d.tasks
      .filter((t) => t.parent_id === parent)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const taskLines = (list: Task[], depth: number): string[] =>
    list.flatMap((t) => {
      const bits = [t.title];
      if (t.agent) bits.push(`@${t.agent}`);
      if (t.status === "doing" || t.status === "blocked") bits.push(`(${t.status})`);
      if (t.due_date) bits.push(`due ${t.due_date}`);
      return [
        `${"  ".repeat(depth)}- [${t.status === "done" ? "x" : " "}] ${bits.join(" ")}`,
        ...taskLines(kids(t.id), depth + 1),
      ];
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
    for (const e of changes) {
      const head = [e.entry_date, e.version, e.change_type].filter(Boolean).join(" · ");
      out.push(`- **${head}** ${e.title}${e.body ? `: ${e.body}` : ""}`);
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
