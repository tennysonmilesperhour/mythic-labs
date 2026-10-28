import { mutate, newId, readSnapshot, type Snapshot } from "./store";
import {
  SOON_DAYS,
  STATUSES,
  STATUS_META,
  WORKABLE,
  computeAttention,
  computeStats,
  daysFromNow,
  groupAttention,
  isReady,
  openDescendants,
  rankReady,
  sortAttention,
  sortProjects,
  type Entry,
  type Hub,
  type Milestone,
  type Project,
  type ProjectDetail,
  type ProjectStatus,
  type Task,
  type TaskRef,
} from "./projectTypes";

// Data lives in git via store.ts: one JSON file per project.

const PROJECT_FIELDS = [
  "name", "owner", "repo", "source_key", "status", "priority", "summary", "description",
  "next_action", "agent_instructions", "tags", "agents", "tools", "links", "start_date",
  "target_date", "sort_order",
] as const;
const MILESTONE_FIELDS = [
  "title", "description", "start_date", "target_date", "done", "sort_order",
] as const;
const TASK_FIELDS = [
  "title", "source_key", "notes", "acceptance", "depends_on", "status", "priority", "agent",
  "due_date", "milestone_id", "parent_id", "sort_order",
] as const;
const ENTRY_FIELDS = [
  "kind", "title", "body", "entry_date", "author", "version", "change_type", "source_url", "evidence_url",
  "decision_status", "context", "alternatives", "consequences",
] as const;

function pick(
  input: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in input) out[f] = input[f] === "" && f.endsWith("_date") ? null : input[f];
  }
  return out;
}

export class NotFound extends Error {}
export class Conflict extends Error {}
export class Invalid extends Error {}

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const normalizeSourceKey = (value: unknown) => typeof value === "string" ? value.trim() : "";

// ─────────── draft helpers (run inside mutate, so they may run twice) ───────────

function projectIn(s: Snapshot, id: string): ProjectDetail {
  const d = s.projects.get(id);
  if (!d) throw new NotFound("project not found");
  return d;
}

function findIn<K extends "tasks" | "milestones" | "entries">(
  s: Snapshot,
  kind: K,
  id: string
): { d: ProjectDetail; item: ProjectDetail[K][number] } {
  for (const d of Array.from(s.projects.values())) {
    const item = (d[kind] as Array<{ id: string }>).find((x) => x.id === id);
    if (item) return { d, item: item as ProjectDetail[K][number] };
  }
  throw new NotFound(`${kind.slice(0, -1)} not found`);
}

function touch(d: ProjectDetail) {
  d.project.updated_at = now();
}

function addEntry(d: ProjectDetail, input: Record<string, unknown>): Entry {
  const clean = pick(input, ENTRY_FIELDS);
  if (!String(clean.title || "").trim()) throw new Invalid("title required");
  const entry: Entry = {
    id: newId(),
    project_id: d.project.id,
    kind: "note",
    title: "",
    body: "",
    entry_date: today(),
    author: null,
    version: null,
    change_type: null,
    source_url: null,
    evidence_url: null,
    decision_status: null,
    context: "",
    alternatives: "",
    consequences: "",
    created_at: now(),
    ...(clean as Partial<Entry>),
  };
  d.entries.push(entry);
  return entry;
}

/** "Lanternfish: " for commit messages. */
const pfx = (s: Snapshot, projectId: string) => `${s.projects.get(projectId)?.project.name ?? "?"}: `;
const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
const by = (agent?: string | null) => (agent ? ` (@${agent})` : "");

// ─────────── reads ───────────

function ordered(d: ProjectDetail): ProjectDetail {
  const bySort = <T extends { sort_order: number; created_at: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  return {
    ...d,
    project: d.project,
    milestones: bySort(d.milestones),
    tasks: bySort(d.tasks),
    entries: [...d.entries].sort(
      (a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at)
    ),
  };
}

/** Every project with its plan and log. */
export async function loadAll(): Promise<ProjectDetail[]> {
  const s = await readSnapshot();
  return Array.from(s.projects.values()).map(ordered);
}

export async function getProjectDetail(id: string): Promise<ProjectDetail> {
  return ordered(projectIn(await readSnapshot(), id));
}

export function summarize(d: ProjectDetail) {
  const stats = computeStats(d.tasks, d.milestones, [
    ...d.entries.map((e) => e.created_at),
    d.project.updated_at,
  ]);
  return { ...d.project, stats, attention: computeAttention(d, stats.lastActivity) };
}

/** Everything the projects hub shows at a glance. */
export async function getHub(): Promise<Hub> {
  const all = await loadAll();
  const projects = sortProjects(all.map(summarize));
  const ref = (d: ProjectDetail, t: Task): TaskRef => ({
    ...t,
    project_name: d.project.name,
    project_status: d.project.status,
  });

  const soon = daysFromNow(SOON_DAYS);
  const live = all.filter((d) => d.project.status !== "paused");
  const timeline = all
    .flatMap((d) =>
      d.milestones.map((m) => {
        const mt = d.tasks.filter((t) => t.milestone_id === m.id);
        return {
          ...m,
          project_name: d.project.name,
          project_status: d.project.status,
          tasks_total: mt.length,
          tasks_done: mt.filter((t) => t.status === "done").length,
        };
      })
    )
    .sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"));

  return {
    projects,
    timeline,
    attention: groupAttention(sortAttention(projects.flatMap((p) => p.attention), projects)),
    inProgress: live
      .flatMap((d) => d.tasks.filter((t) => t.status === "doing").map((t) => ref(d, t)))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    upcoming: live
      .flatMap((d) =>
        d.tasks
          .filter((t) => t.status !== "done" && t.due_date && t.due_date <= soon)
          .map((t) => ref(d, t))
      )
      .sort((a, b) => a.due_date!.localeCompare(b.due_date!)),
  };
}

// ─────────── projects ───────────

export async function createProjects(
  rows: Array<Record<string, unknown>>
): Promise<{ created: Project[]; failed: Array<{ name: string; reason: string }> }> {
  return mutate(
    (r) => `Add ${r.created.length === 1 ? `project ${r.created[0].name}` : `${r.created.length} projects`}`,
    (s) => {
      const created: Project[] = [];
      const failed: Array<{ name: string; reason: string }> = [];
      const key = (o?: unknown, r?: unknown) => (o && r ? `${o}/${r}`.toLowerCase() : null);
      const sourceKeys = new Set(Array.from(s.projects.values()).map((d) => normalizeSourceKey(d.project.source_key)).filter(Boolean));
      const taken = new Set(
        Array.from(s.projects.values()).map((d) => key(d.project.owner, d.project.repo)).filter(Boolean)
      );
      for (const row of rows) {
        const clean = pick(row, PROJECT_FIELDS);
        const pname = String(clean.name || (clean.repo ?? "")).trim();
        if (!pname) {
          failed.push({ name: "(blank)", reason: "name required" });
          continue;
        }
        if (clean.status && !STATUSES.includes(clean.status as ProjectStatus)) {
          failed.push({ name: pname, reason: `status must be one of ${STATUSES.join(", ")}` });
          continue;
        }
        const k = key(clean.owner, clean.repo);
        const sourceKey = normalizeSourceKey(clean.source_key);
        if (sourceKey && sourceKeys.has(sourceKey)) {
          failed.push({ name: pname, reason: "source_key already tracked" });
          continue;
        }
        if (k && taken.has(k)) {
          failed.push({ name: pname, reason: "already tracked" });
          continue;
        }
        if (k) taken.add(k);
        if (sourceKey) sourceKeys.add(sourceKey);
        if (sourceKey) clean.source_key = sourceKey;
        const t = now();
        const project: Project = {
          id: newId(),
          name: pname,
          owner: null,
          repo: null,
          status: "planned",
          priority: "medium",
          summary: "",
          description: "",
          next_action: "",
          agent_instructions: "",
          tags: [],
          agents: [],
          tools: [],
          links: [],
          start_date: null,
          target_date: null,
          sort_order: 0,
          ...(clean as Partial<Project>),
          status_changed_at: t,
          created_at: t,
          updated_at: t,
        };
        project.name = pname;
        s.projects.set(project.id, { project, milestones: [], tasks: [], entries: [] });
        created.push(project);
      }
      return { created, failed };
    }
  );
}

export async function updateProject(
  id: string,
  patch: Record<string, unknown>
): Promise<{ project: Project; entry: Entry | null }> {
  const clean = pick(patch, PROJECT_FIELDS);
  if (clean.status && !STATUSES.includes(clean.status as ProjectStatus)) {
    throw new Invalid(`status must be one of ${STATUSES.join(", ")}`);
  }
  return mutate(
    (r) => `${r.project.name}: ${r.entry ? `status ${r.entry.title}` : `edit ${Object.keys(clean).join(", ")}`}`,
    (s) => {
      const d = projectIn(s, id);
      if ("source_key" in clean) {
        const sourceKey = normalizeSourceKey(clean.source_key);
        if (sourceKey && Array.from(s.projects.values()).some((other) => other.project.id !== id && normalizeSourceKey(other.project.source_key) === sourceKey)) {
          throw new Conflict("source_key already tracked");
        }
        clean.source_key = sourceKey || null;
      }
      const before = d.project.status;
      const statusChanged = !!clean.status && clean.status !== before;
      Object.assign(d.project, clean, { updated_at: now() });
      let entry: Entry | null = null;
      if (statusChanged) {
        d.project.status_changed_at = now();
        entry = addEntry(d, {
          kind: "status",
          title: `${STATUS_META[before].label} → ${STATUS_META[clean.status as ProjectStatus].label}`,
          body: typeof patch.status_note === "string" ? patch.status_note : "",
        });
      }
      return { project: d.project, entry };
    }
  );
}

export async function deleteProject(id: string): Promise<void> {
  await mutate(
    (n: string) => `Delete project ${n}`,
    (s) => {
      const n = projectIn(s, id).project.name;
      s.projects.delete(id);
      return n;
    }
  );
}

// ─────────── milestones ───────────

export async function createMilestone(projectId: string, input: Record<string, unknown>): Promise<Milestone> {
  const clean = pick(input, MILESTONE_FIELDS);
  if (!String(clean.title || "").trim()) throw new Invalid("title required");
  return mutate(
    (m, s) => `${pfx(s, m.project_id)}milestone ${clip(m.title)} added`,
    (s) => {
      const d = projectIn(s, projectId);
      const m: Milestone = {
        id: newId(),
        project_id: projectId,
        title: "",
        description: "",
        start_date: null,
        target_date: null,
        done: false,
        done_at: null,
        sort_order: d.milestones.length,
        created_at: now(),
        ...(clean as Partial<Milestone>),
      };
      d.milestones.push(m);
      touch(d);
      return m;
    }
  );
}

export async function updateMilestone(id: string, patch: Record<string, unknown>): Promise<Milestone> {
  const clean = pick(patch, MILESTONE_FIELDS);
  return mutate(
    (m, s) => `${pfx(s, m.project_id)}milestone ${clip(m.title)} ${"done" in clean ? (clean.done ? "reached" : "reopened") : "edited"}`,
    (s) => {
      const { d, item } = findIn(s, "milestones", id);
      const m = item as Milestone;
      Object.assign(m, clean);
      if ("done" in clean) m.done_at = clean.done ? now() : null;
      touch(d);
      return m;
    }
  );
}

export async function deleteMilestone(id: string): Promise<void> {
  await mutate(
    (t: string) => `Delete milestone ${clip(t)}`,
    (s) => {
      const { d, item } = findIn(s, "milestones", id);
      d.milestones = d.milestones.filter((m) => m.id !== id);
      for (const t of d.tasks) if (t.milestone_id === id) t.milestone_id = null;
      touch(d);
      return (item as Milestone).title;
    }
  );
}

// ─────────── tasks ───────────

function newTask(d: ProjectDetail, clean: Record<string, unknown>): Task {
  if (!String(clean.title || "").trim()) throw new Invalid("title required");
  if (clean.parent_id) {
    // Subtasks live in their parent's project and milestone.
    const parent = d.tasks.find((t) => t.id === clean.parent_id);
    if (!parent) throw new NotFound("parent task not found in this project");
    if (!clean.milestone_id) clean.milestone_id = parent.milestone_id;
  }
  const t = now();
  const task: Task = {
    id: newId(),
    project_id: d.project.id,
    milestone_id: null,
    parent_id: null,
    title: "",
    notes: "",
    acceptance: "",
    depends_on: [],
    status: "todo",
    priority: "medium",
    agent: null,
    due_date: null,
    claimed_at: null,
    done_at: null,
    sort_order: d.tasks.length,
    created_at: t,
    updated_at: t,
    ...(clean as Partial<Task>),
  };
  if (task.status === "done") task.done_at = t;
  if (task.status === "doing") task.claimed_at = t;
  d.tasks.push(task);
  touch(d);
  return task;
}

function applyTaskPatch(d: ProjectDetail, task: Task, clean: Record<string, unknown>) {
  if (Array.isArray(clean.depends_on)) {
    const ids = new Set(d.tasks.map((t) => t.id));
    clean.depends_on = (clean.depends_on as string[]).filter((x) => x !== task.id && ids.has(x));
  }
  if ("status" in clean && clean.status !== task.status) {
    task.done_at = clean.status === "done" ? now() : null;
    if (clean.status === "doing") task.claimed_at = now();
  }
  Object.assign(task, clean, { updated_at: now() });
  touch(d);
}

export async function createTask(projectId: string, input: Record<string, unknown>): Promise<Task> {
  return mutate(
    (t, s) => `${pfx(s, t.project_id)}add ${clip(t.title)}`,
    (s) => newTask(projectIn(s, projectId), pick(input, TASK_FIELDS.filter((field) => field !== "source_key")))
  );
}

/** Import tasks in one atomic store mutation. A stable source_key makes retries safe. */
export async function createTasks(
  projectId: string,
  inputs: Array<Record<string, unknown>>
): Promise<{ created: Task[]; skipped: number }> {
  return mutate(
    (r, s) => `${pfx(s, projectId)}import ${r.created.length} tasks`,
    (s) => {
      const d = projectIn(s, projectId);
      const sources = new Map<string, string>();
      for (const detail of s.projects.values()) {
        for (const task of detail.tasks) {
          const sourceKey = normalizeSourceKey(task.source_key);
          if (sourceKey) sources.set(sourceKey, detail.project.id);
        }
      }
      const seen = new Set<string>();
      const created: Task[] = [];
      let skipped = 0;
      for (const input of inputs) {
        const clean = pick(input, TASK_FIELDS);
        const sourceKey = normalizeSourceKey(clean.source_key);
        if (!sourceKey) throw new Invalid("source_key required for batch task imports");
        const existingProjectId = sources.get(sourceKey);
        if (existingProjectId && existingProjectId !== projectId) {
          throw new Conflict("task source_key already belongs to another project");
        }
        if (existingProjectId === projectId || seen.has(sourceKey)) {
          skipped++;
          continue;
        }
        clean.source_key = sourceKey;
        const task = newTask(d, clean);
        created.push(task);
        seen.add(sourceKey);
      }
      return { created, skipped };
    }
  );
}

export async function updateTask(id: string, patch: Record<string, unknown>): Promise<Task> {
  const clean = pick(patch, TASK_FIELDS);
  return mutate(
    (t, s) => `${pfx(s, t.project_id)}${clip(t.title)} → ${"status" in clean ? t.status : `edit ${Object.keys(clean).join(", ")}`}`,
    (s) => {
      const { d, item } = findIn(s, "tasks", id);
      if ("source_key" in clean) {
        const key = normalizeSourceKey(clean.source_key);
        if (!key) throw new Invalid("source_key cannot be blank");
        const used = Array.from(s.projects.values()).flatMap((project) => project.tasks)
          .some((task) => task.id !== id && normalizeSourceKey(task.source_key) === key);
        if (used) throw new Conflict("task source_key already tracked");
        clean.source_key = key;
      }
      applyTaskPatch(d, item as Task, { ...clean });
      return item as Task;
    }
  );
}

export async function deleteTask(id: string): Promise<void> {
  await mutate(
    (t: string) => `Delete task ${clip(t)}`,
    (s) => {
      const { d, item } = findIn(s, "tasks", id);
      const drop = new Set([id, ...openDescendants(item as Task, d.tasks).map((t) => t.id)]);
      // openDescendants skips finished subtasks; sweep every descendant.
      let grew = true;
      while (grew) {
        grew = false;
        for (const t of d.tasks) {
          if (t.parent_id && drop.has(t.parent_id) && !drop.has(t.id)) {
            drop.add(t.id);
            grew = true;
          }
        }
      }
      d.tasks = d.tasks.filter((t) => !drop.has(t.id));
      for (const t of d.tasks) t.depends_on = t.depends_on.filter((x) => !drop.has(x));
      touch(d);
      return (item as Task).title;
    }
  );
}

// ─────────── entries ───────────

export async function createEntries(
  projectId: string,
  inputs: Array<Record<string, unknown>>
): Promise<{ created: Entry[]; skipped: number }> {
  return mutate(
    (r, s) => {
      const e = r.created[0];
      if (r.created.length !== 1) return `${pfx(s, projectId)}log ${r.created.length} entries`;
      return `${pfx(s, projectId)}${e.kind} · ${clip(e.title)}${by(e.author)}`;
    },
    (s) => {
      const d = projectIn(s, projectId);
      const created: Entry[] = [];
      let skipped = 0;
      for (const input of inputs) {
        // Same source_url imported twice: skip quietly.
        if (input.source_url && d.entries.some((e) => e.source_url === input.source_url)) {
          skipped++;
          continue;
        }
        created.push(addEntry(d, input));
      }
      if (created.length) touch(d);
      return { created, skipped };
    }
  );
}

/** Agent writes are checked against project status in the same atomic mutation. */
function assertAgentProject(d: ProjectDetail, agent: string) {
  if (!WORKABLE.includes(d.project.status)) throw new Conflict(`project is ${d.project.status}; agent writes are disabled`);
  if (d.project.agents.length && !d.project.agents.includes(agent)) throw new Conflict(`agent @${agent} is not enabled for this project`);
}

export async function createAgentTask(projectId: string, agent: string, input: Record<string, unknown>): Promise<Task> {
  return mutate(
    (task, s) => `${pfx(s, projectId)}add task ${clip(task.title)} (@${agent})`,
    (s) => {
      const d = projectIn(s, projectId);
      assertAgentProject(d, agent);
      const clean = pick(input, TASK_FIELDS.filter((field) => field !== "source_key"));
      const task = newTask(d, clean);
      addEntry(d, { kind: "progress", title: `Added task: ${task.title}`, author: agent });
      return task;
    }
  );
}

export async function createAgentEntry(projectId: string, agent: string, input: Record<string, unknown>): Promise<{ created: Entry[]; skipped: number }> {
  return mutate(
    (r, s) => `${pfx(s, projectId)}${r.created.length ? `agent log ${clip(r.created[0].title)}` : "agent log duplicate"}`,
    (s) => {
      const d = projectIn(s, projectId);
      assertAgentProject(d, agent);
      if (input.source_url && d.entries.some((e) => e.source_url === input.source_url)) return { created: [], skipped: 1 };
      const entry = addEntry(d, input);
      touch(d);
      return { created: [entry], skipped: 0 };
    }
  );
}

export async function updateAgentNextAction(projectId: string, agent: string, nextAction: string) {
  return mutate(
    (_result, s) => `${pfx(s, projectId)}update next action (@${agent})`,
    (s) => {
      const d = projectIn(s, projectId);
      assertAgentProject(d, agent);
      d.project.next_action = nextAction;
      touch(d);
      return { project: d.project, entry: null };
    }
  );
}

export async function updateEntry(id: string, patch: Record<string, unknown>): Promise<Entry> {
  const clean = pick(patch, ENTRY_FIELDS);
  return mutate(
    (e, s) => `${pfx(s, e.project_id)}${clip(e.title)} → ${clean.decision_status ?? "edited"}`,
    (s) => {
      const { d, item } = findIn(s, "entries", id);
      Object.assign(item, clean);
      touch(d);
      return item as Entry;
    }
  );
}

export async function deleteEntry(id: string): Promise<void> {
  await mutate(
    (t: string) => `Delete entry ${clip(t)}`,
    (s) => {
      const { d, item } = findIn(s, "entries", id);
      d.entries = d.entries.filter((e) => e.id !== id);
      touch(d);
      return (item as Entry).title;
    }
  );
}

// ─────────── agent workflow ───────────

/**
 * The next task an agent should take: ready, in an active or building
 * project, assigned to this agent or unassigned. Ordered by project priority,
 * then the project's own ready order.
 */
export async function nextTask(
  agent: string,
  projectId?: string
): Promise<{ task: Task; detail: ProjectDetail } | null> {
  const all = sortProjects((await loadAll()).map((d) => ({ ...d.project, d }))).map((x) => x.d);
  for (const d of all) {
    if (projectId && d.project.id !== projectId) continue;
    if (!WORKABLE.includes(d.project.status)) continue;
    // A nonempty project agent list constrains every task, including those
    // explicitly assigned to an agent. Keep selection aligned with claimTask.
    if (d.project.agents.length && !d.project.agents.includes(agent)) continue;
    // Unassigned work is available when the project lists this agent (or none).
    const open = !d.project.agents.length || d.project.agents.includes(agent);
    const task = rankReady(d.tasks, d.milestones).find((t) => t.agent === agent || (!t.agent && open));
    if (task) return { task, detail: d };
  }
  return null;
}

/** Atomic: the check and the claim land in one commit, so two agents can't both win. */
export async function claimTask(id: string, agent: string): Promise<Task> {
  return mutate(
    (t, s) => `${pfx(s, t.project_id)}${clip(t.title)} claimed by @${agent}`,
    (s) => {
      const { d, item } = findIn(s, "tasks", id);
      const task = item as Task;
      assertAgentProject(d, agent);
      if (task.status === "doing" && task.agent === agent) return task;
      if (task.status === "doing" && task.agent !== agent) {
        throw new Conflict(`already claimed by @${task.agent}`);
      }
      if (task.agent && task.agent !== agent) throw new Conflict(`assigned to @${task.agent}`);
      if (task.status !== "doing" && !isReady(task, d.tasks)) {
        throw new Conflict(`not ready (status ${task.status}, or waiting on dependencies or subtasks)`);
      }
      applyTaskPatch(d, task, { status: "doing", agent });
      addEntry(d, { kind: "progress", title: `Started: ${task.title}`, author: agent });
      return task;
    }
  );
}

/** Status change and/or progress note from an agent; the note is logged. */
export async function reportTask(
  id: string,
  agent: string,
  input: { status?: string; note?: string }
): Promise<Task> {
  const verb =
    input.status === "done" ? "Finished" :
    input.status === "blocked" ? "Blocked" :
    input.status === "todo" ? "Released" : "Progress";
  return mutate(
    (t, s) => `${pfx(s, t.project_id)}${verb.toLowerCase()} ${clip(t.title)} (@${agent})`,
    (s) => {
      const { d, item } = findIn(s, "tasks", id);
      const task = item as Task;
      assertAgentProject(d, agent);
      if (task.status !== "doing" || task.agent !== agent) throw new Conflict("claim this task before reporting progress");
      if (input.status === "done") {
        const open = openDescendants(task, d.tasks);
        if (open.length) {
          throw new Conflict(`finish or remove its open subtasks first: ${open.map((t) => t.title).join("; ")}`);
        }
      }
      applyTaskPatch(d, task, input.status ? { status: input.status } : {});
      addEntry(d, { kind: "progress", title: `${verb}: ${task.title}`, body: input.note ?? "", author: agent });
      return task;
    }
  );
}

