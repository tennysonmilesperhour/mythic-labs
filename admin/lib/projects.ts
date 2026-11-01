import { ME, isMine } from "./taskMap";
import { PLAN_TEMPLATES, type PlanTemplate } from "./templates";
import {
  listHistory,
  mutate,
  newId,
  readFileAt,
  readSnapshot,
  storeHasHistory,
  type HistoryEntry,
  type Snapshot,
} from "./store";
import {
  CHANGE_TYPES,
  DECISION_STATUSES,
  HEALTH_LEVELS,
  PRIORITIES,
  PRIORITY_RANK,
  RECURRENCES,
  SOON_DAYS,
  STATUSES,
  STATUS_META,
  TASK_STATUSES,
  WORKABLE,
  addDays,
  computeAttention,
  computeStats,
  dayOfMonth,
  daysFromNow,
  groupAttention,
  isReady,
  isSnoozed,
  isUpcoming,
  nextOccurrenceAfter,
  normalizeDetail,
  normalizeTask,
  openDescendants,
  projectHealth,
  rankReady,
  sortAttention,
  sortProjects,
  type Entry,
  type EntryKind,
  type Hub,
  type InboxItem,
  type Milestone,
  type Priority,
  type Project,
  type ProjectDetail,
  type ProjectStatus,
  type Recurrence,
  type Task,
  type TaskRef,
  type TaskStatus,
} from "./projectTypes";

// Data lives in git via store.ts: one JSON file per project.

const PROJECT_FIELDS = [
  "name", "owner", "repo", "source_key", "status", "priority", "summary", "description",
  "next_action", "agent_instructions", "tags", "agents", "tools", "links", "start_date",
  "target_date", "last_reviewed_at", "sort_order",
] as const;
const MILESTONE_FIELDS = [
  "title", "description", "start_date", "target_date", "done", "sort_order",
] as const;
const TASK_FIELDS = [
  "title", "source_key", "notes", "acceptance", "depends_on", "status", "priority", "agent",
  "due_date", "estimate", "planned_for", "recurrence", "labels", "snoozed_until", "milestone_id", "parent_id", "sort_order",
] as const;
const ENTRY_FIELDS = [
  "kind", "task_id", "title", "body", "entry_date", "author", "version", "change_type", "source_url", "evidence_url",
  "decision_status", "health", "context", "alternatives", "consequences",
] as const;
const INBOX_FIELDS = ["title", "notes", "source", "project_id", "agent", "priority", "due_date", "planned_for", "recurrence", "estimate", "labels"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date in YYYY-MM-DD form; the Date parser alone would roll 2026-02-30 into March and choke on month 13 later. */
const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ENTRY_KINDS: readonly EntryKind[] = ["changelog", "decision", "note", "status", "progress", "update"];

/** Reject malformed project fields before they reach the store. Mutates `clean` into canonical shape. */
function validateProjectFields(clean: Record<string, unknown>) {
  if ("status" in clean && !STATUSES.includes(clean.status as ProjectStatus)) throw new Invalid(`status must be one of ${STATUSES.join(", ")}`);
  if ("priority" in clean && !(PRIORITIES as readonly string[]).includes(String(clean.priority))) throw new Invalid(`priority must be one of ${PRIORITIES.join(", ")}`);
  for (const f of ["start_date", "target_date"] as const) {
    if (f in clean && clean[f] !== null && !isDate(clean[f])) throw new Invalid(`${f} must be a real date (YYYY-MM-DD) or null`);
  }
  for (const f of ["owner", "repo"] as const) {
    if (f in clean && clean[f] !== null && typeof clean[f] !== "string") throw new Invalid(`${f} must be a string or null`);
  }
  if ("links" in clean) {
    const links = clean.links;
    if (!Array.isArray(links) || links.some((l) => !l || typeof l !== "object" || typeof (l as { label?: unknown }).label !== "string" || typeof (l as { url?: unknown }).url !== "string")) {
      throw new Invalid("links must be an array of { label, url }");
    }
    clean.links = (links as Array<{ label: string; url: string }>).map((l) => ({ label: l.label, url: l.url }));
  }
  if ("last_reviewed_at" in clean) {
    if (!clean.last_reviewed_at) clean.last_reviewed_at = null;
    else if (!(typeof clean.last_reviewed_at === "string" && ISO_RE.test(clean.last_reviewed_at) && !Number.isNaN(Date.parse(clean.last_reviewed_at)))) {
      throw new Invalid("last_reviewed_at must be an ISO timestamp or null");
    }
  }
  for (const f of ["tags", "agents", "tools"] as const) {
    if (!(f in clean)) continue;
    if (!Array.isArray(clean[f])) throw new Invalid(`${f} must be an array of strings`);
    clean[f] = Array.from(new Set((clean[f] as unknown[]).map((x) => String(x).trim()).filter(Boolean)));
  }
  for (const f of ["name", "summary", "description", "next_action", "agent_instructions"] as const) {
    if (f in clean && typeof clean[f] !== "string") throw new Invalid(`${f} must be a string`);
  }
  if ("sort_order" in clean && typeof clean.sort_order !== "number") throw new Invalid("sort_order must be a number");
}

/** Reject malformed entry fields before they reach the store. Shared by create and edit. */
function validateEntryFields(d: ProjectDetail, clean: Record<string, unknown>) {
  if ("kind" in clean && !ENTRY_KINDS.includes(clean.kind as EntryKind)) throw new Invalid(`kind must be one of ${ENTRY_KINDS.join(", ")}`);
  if ("task_id" in clean) {
    if (!clean.task_id) clean.task_id = null;
    else if (typeof clean.task_id !== "string" || !d.tasks.some((t) => t.id === clean.task_id)) throw new NotFound("task not found in this project");
  }
  if ("health" in clean && clean.health !== null && !(HEALTH_LEVELS as readonly string[]).includes(String(clean.health))) {
    throw new Invalid(`health must be one of ${HEALTH_LEVELS.join(", ")}, or null`);
  }
  if ("decision_status" in clean && clean.decision_status !== null && !(DECISION_STATUSES as readonly string[]).includes(String(clean.decision_status))) {
    throw new Invalid(`decision_status must be one of ${DECISION_STATUSES.join(", ")}, or null`);
  }
  if ("change_type" in clean && clean.change_type !== null && !(CHANGE_TYPES as readonly string[]).includes(String(clean.change_type))) {
    throw new Invalid(`change_type must be one of ${CHANGE_TYPES.join(", ")}, or null`);
  }
  if ("entry_date" in clean) {
    // An empty date means today on create and no change on edit.
    if (!clean.entry_date) delete clean.entry_date;
    else if (!isDate(clean.entry_date)) throw new Invalid("entry_date must be a real date (YYYY-MM-DD)");
  }
  for (const f of ["title", "body", "context", "alternatives", "consequences"] as const) {
    if (f in clean && typeof clean[f] !== "string") throw new Invalid(`${f} must be a string`);
  }
  for (const f of ["author", "version", "source_url", "evidence_url"] as const) {
    if (f in clean && clean[f] !== null && typeof clean[f] !== "string") throw new Invalid(`${f} must be a string or null`);
  }
}

/** Reject malformed task fields before they reach the store. Mutates `clean` into canonical shape. */
function validateTaskFields(clean: Record<string, unknown>) {
  if ("status" in clean && !(TASK_STATUSES as readonly string[]).includes(String(clean.status))) {
    throw new Invalid(`status must be one of ${TASK_STATUSES.join(", ")}`);
  }
  if ("priority" in clean && !(PRIORITIES as readonly string[]).includes(String(clean.priority))) {
    throw new Invalid(`priority must be one of ${PRIORITIES.join(", ")}`);
  }
  for (const f of ["due_date", "planned_for", "snoozed_until"] as const) {
    if (f in clean && clean[f] !== null && !isDate(clean[f])) {
      throw new Invalid(`${f} must be a real date (YYYY-MM-DD) or null`);
    }
  }
  if ("estimate" in clean) {
    if (clean.estimate === null || clean.estimate === "" || clean.estimate === undefined) clean.estimate = null;
    else {
      const n = Number(clean.estimate);
      if (!Number.isFinite(n) || n <= 0 || n > 100) throw new Invalid("estimate must be a positive number of points, or null");
      clean.estimate = Math.round(n);
    }
  }
  if ("recurrence" in clean) {
    if (!clean.recurrence) clean.recurrence = null;
    else if (!(RECURRENCES as readonly string[]).includes(String(clean.recurrence))) {
      throw new Invalid(`recurrence must be one of ${RECURRENCES.join(", ")}, or null`);
    }
  }
  if ("labels" in clean) {
    if (!Array.isArray(clean.labels)) throw new Invalid("labels must be an array of strings");
    clean.labels = Array.from(
      new Set((clean.labels as unknown[]).map((l) => String(l).trim().replace(/^#/, "")).filter(Boolean))
    );
  }
  if ("agent" in clean && clean.agent !== null && typeof clean.agent !== "string") throw new Invalid("agent must be a string or null");
  if ("agent" in clean && typeof clean.agent === "string") clean.agent = clean.agent.trim() || null;
}

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

/**
 * Every record id in the store: projects, their milestones, tasks and entries,
 * tracked repositories and inbox items. The store refuses to read a snapshot
 * with a duplicate anywhere, so a restore must check all of them.
 */
function allRecordIds(s: Snapshot): Set<string> {
  const ids = new Set<string>(s.inbox.items.map((i) => i.id));
  for (const r of s.repos.repos) ids.add(r.id);
  for (const [pid, d] of Array.from(s.projects.entries())) {
    ids.add(pid);
    ids.add(d.project.id);
    for (const x of [...d.tasks, ...d.milestones, ...d.entries]) ids.add(x.id);
  }
  return ids;
}

function addEntry(d: ProjectDetail, input: Record<string, unknown>): Entry {
  const clean = pick(input, ENTRY_FIELDS);
  if (!String(clean.title || "").trim()) throw new Invalid("title required");
  validateEntryFields(d, clean);
  if (clean.kind === "update" && !clean.health) throw new Invalid("a status update needs a health call");
  const entry: Entry = {
    id: newId(),
    project_id: d.project.id,
    task_id: null,
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
    health: null,
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
  const attention = computeAttention(d, stats.lastActivity);
  return { ...d.project, stats, attention, health: projectHealth(d, stats, attention) };
}

/**
 * Today's plan for one project: planned for today or earlier, yours and due by today, or
 * yours and in progress. A plan date decides on its own, so a task moved to tomorrow
 * leaves today even when it is due or in progress.
 */
export function isToday(t: Task, day: string): boolean {
  if (t.status === "done" || isSnoozed(t, day)) return false;
  if (t.planned_for) return t.planned_for <= day;
  if (!isMine(t)) return false;
  return t.status === "doing" || (!!t.due_date && t.due_date <= day);
}

const TODAY_RANK = (t: Task, day: string) =>
  t.status === "doing" ? 0 : t.due_date && t.due_date < day ? 1 : t.due_date === day ? 2 : t.status === "blocked" ? 4 : 3;

/** Everything the projects hub shows at a glance. */
export async function getHub(): Promise<Hub> {
  const [all, inbox] = await Promise.all([loadAll(), listInbox()]);
  const projects = sortProjects(all.map(summarize));
  const ref = (d: ProjectDetail, t: Task): TaskRef => ({
    ...t,
    project_name: d.project.name,
    project_status: d.project.status,
  });

  const soon = daysFromNow(SOON_DAYS);
  const day = today();
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
          .filter((t) => isUpcoming(t.due_date, t.status, soon))
          .map((t) => ref(d, t))
      )
      .sort((a, b) => a.due_date!.localeCompare(b.due_date!)),
    mine: live
      .flatMap((d) => d.tasks.filter((t) => isMine(t) && t.status !== "done" && !isSnoozed(t, day)).map((t) => ref(d, t)))
      .sort(
        (a, b) =>
          Number(b.status === "doing") - Number(a.status === "doing") ||
          Number(a.status === "blocked") - Number(b.status === "blocked") ||
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
      ),
    today: live
      .flatMap((d) => d.tasks.filter((t) => isToday(t, day)).map((t) => ref(d, t)))
      .sort(
        (a, b) =>
          TODAY_RANK(a, day) - TODAY_RANK(b, day) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
          a.sort_order - b.sort_order
      ),
    doneToday: all
      .flatMap((d) => d.tasks.filter((t) => t.status === "done" && t.done_at?.slice(0, 10) === day).map((t) => ref(d, t)))
      .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")),
    dated: live
      .flatMap((d) => d.tasks.filter((t) => t.status !== "done" && t.due_date).map((t) => ref(d, t)))
      .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    inbox,
    recent: all
      .flatMap((d) =>
        d.entries
          .filter((e) => e.kind === "changelog" || e.kind === "decision" || e.kind === "update")
          .map((e) => ({ ...e, project_name: d.project.name }))
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8),
  };
}

// ─────────── search ───────────

export type SearchIndex = {
  projects: Array<Pick<Project, "id" | "name" | "status" | "priority" | "owner" | "repo" | "summary" | "tags" | "agents">>;
  tasks: Array<
    Pick<Task, "id" | "project_id" | "title" | "status" | "priority" | "agent" | "due_date" | "labels" | "planned_for" | "estimate"> & {
      project_name: string;
      ready: boolean;
    }
  >;
  milestones: Array<Pick<Milestone, "id" | "project_id" | "title" | "target_date" | "done"> & { project_name: string }>;
  entries: Array<Pick<Entry, "id" | "project_id" | "kind" | "title" | "entry_date" | "decision_status" | "author"> & { project_name: string }>;
  inbox: Array<Pick<InboxItem, "id" | "title" | "created_at">>;
  generated_at: string;
};

/** Everything the command palette searches, trimmed to what a result row shows. */
export async function searchIndex(): Promise<SearchIndex> {
  const [all, inbox] = await Promise.all([loadAll(), listInbox()]);
  const projects = sortProjects(all.map((d) => d.project));
  return {
    projects: projects.map(({ id, name, status, priority, owner, repo, summary, tags, agents }) => ({ id, name, status, priority, owner, repo, summary, tags, agents })),
    tasks: all.flatMap((d) =>
      d.tasks.map((t) => ({
        id: t.id,
        project_id: t.project_id,
        project_name: d.project.name,
        title: t.title,
        status: t.status,
        priority: t.priority,
        agent: t.agent,
        due_date: t.due_date,
        labels: t.labels,
        planned_for: t.planned_for,
        estimate: t.estimate,
        ready: isReady(t, d.tasks),
      }))
    ),
    milestones: all.flatMap((d) =>
      d.milestones.map((m) => ({ id: m.id, project_id: m.project_id, project_name: d.project.name, title: m.title, target_date: m.target_date, done: m.done }))
    ),
    entries: all.flatMap((d) =>
      d.entries
        .filter((e) => e.kind !== "status" && e.kind !== "progress")
        .map((e) => ({ id: e.id, project_id: e.project_id, project_name: d.project.name, kind: e.kind, title: e.title, entry_date: e.entry_date, decision_status: e.decision_status, author: e.author }))
    ),
    inbox: inbox.map(({ id, title, created_at }) => ({ id, title, created_at })),
    generated_at: now(),
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
        try {
          validateProjectFields(clean);
        } catch (e) {
          failed.push({ name: pname, reason: (e as Error).message });
          continue;
        }
        // A plan template is laid down in the same commit, so a failure cannot leave a half-made project.
        const template = typeof row.template === "string" && row.template ? PLAN_TEMPLATES.find((t) => t.id === row.template) : undefined;
        if (typeof row.template === "string" && row.template && !template) {
          failed.push({ name: pname, reason: `no template ${row.template}` });
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
          last_reviewed_at: null,
          sort_order: 0,
          ...(clean as Partial<Project>),
          status_changed_at: t,
          created_at: t,
          updated_at: t,
        };
        project.name = pname;
        const detail: ProjectDetail = { project, milestones: [], tasks: [], entries: [] };
        s.projects.set(project.id, detail);
        if (template) layTemplate(detail, template, today());
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
  validateProjectFields(clean);
  if ("name" in clean && !String(clean.name).trim()) throw new Invalid("name required");
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

/**
 * Lay a template's milestones and tasks onto a project in one commit.
 * Milestone target dates run back to back from `start` (today by default).
 */
export async function applyTemplate(projectId: string, templateId: string, start?: string | null): Promise<{ milestones: Milestone[]; tasks: Task[] }> {
  const template = PLAN_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new NotFound(`no template ${templateId}`);
  const from = start && DATE_RE.test(start) ? start : today();
  return mutate(
    (_r, s) => `${pfx(s, projectId)}start from the ${template.name} template`,
    (s) => layTemplate(projectIn(s, projectId), template, from)
  );
}

/** Draft helper: add a template's milestones and tasks to a project. Runs inside mutate(). */
function layTemplate(d: ProjectDetail, template: PlanTemplate, from: string): { milestones: Milestone[]; tasks: Task[] } {
  const made: { milestones: Milestone[]; tasks: Task[] } = { milestones: [], tasks: [] };
  let cursor = from;
  for (const tm of template.milestones) {
    cursor = addDays(cursor, tm.weeks * 7);
    const m: Milestone = {
      id: newId(),
      project_id: d.project.id,
      title: tm.title,
      description: tm.description ?? "",
      start_date: null,
      target_date: cursor,
      done: false,
      done_at: null,
      sort_order: d.milestones.length,
      created_at: now(),
    };
    d.milestones.push(m);
    made.milestones.push(m);
    for (const tt of tm.tasks) {
      made.tasks.push(
        newTask(d, {
          title: tt.title,
          acceptance: tt.acceptance ?? "",
          labels: tt.labels ?? [],
          estimate: tt.estimate ?? null,
          priority: tt.priority ?? "medium",
          agent: tt.agent ?? null,
          milestone_id: m.id,
        })
      );
    }
  }
  touch(d);
  return made;
}

/** Reject malformed milestone fields before they reach the store. */
function validateMilestoneFields(clean: Record<string, unknown>) {
  for (const f of ["title", "description"] as const) {
    if (f in clean && typeof clean[f] !== "string") throw new Invalid(`${f} must be a string`);
  }
  for (const f of ["start_date", "target_date"] as const) {
    if (f in clean && clean[f] !== null && !isDate(clean[f])) throw new Invalid(`${f} must be a real date (YYYY-MM-DD) or null`);
  }
  if ("done" in clean && typeof clean.done !== "boolean") throw new Invalid("done must be true or false");
  if ("sort_order" in clean && typeof clean.sort_order !== "number") throw new Invalid("sort_order must be a number");
}

export async function createMilestone(projectId: string, input: Record<string, unknown>): Promise<Milestone> {
  const clean = pick(input, MILESTONE_FIELDS);
  if (!String(clean.title || "").trim()) throw new Invalid("title required");
  validateMilestoneFields(clean);
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
  if ("title" in clean && !String(clean.title ?? "").trim()) throw new Invalid("title required");
  validateMilestoneFields(clean);
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
  validateTaskFields(clean);
  if (clean.parent_id) {
    // Subtasks live in their parent's project and milestone.
    const parent = d.tasks.find((t) => t.id === clean.parent_id);
    if (!parent) throw new NotFound("parent task not found in this project");
    if (!clean.milestone_id) clean.milestone_id = parent.milestone_id;
  }
  if (clean.milestone_id && !d.milestones.some((m) => m.id === clean.milestone_id)) {
    throw new NotFound("milestone not found in this project");
  }
  if (Array.isArray(clean.depends_on)) {
    const ids = new Set(d.tasks.map((t) => t.id));
    clean.depends_on = (clean.depends_on as string[]).filter((x) => ids.has(x));
  }
  const t = now();
  const task: Task = normalizeTask({
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
    estimate: null,
    planned_for: null,
    recurrence: null,
    labels: [],
    snoozed_until: null,
    recurrence_day: null,
    spawned_from: null,
    claimed_at: null,
    done_at: null,
    sort_order: d.tasks.length,
    created_at: t,
    updated_at: t,
    ...(clean as Partial<Task>),
  });
  task.title = String(task.title).trim();
  if (task.status === "done") task.done_at = t;
  if (task.status === "doing") task.claimed_at = t;
  d.tasks.push(task);
  touch(d);
  return task;
}

/**
 * Apply a validated patch. Finishing a recurring task spawns its next
 * occurrence (due date advanced by the rule) and leaves the finished copy as
 * plain history, so a reopened task never spawns twice.
 */
function applyTaskPatch(d: ProjectDetail, task: Task, clean: Record<string, unknown>): { spawned: Task | null } {
  validateTaskFields(clean);
  if (Array.isArray(clean.depends_on)) {
    const ids = new Set(d.tasks.map((t) => t.id));
    clean.depends_on = (clean.depends_on as string[]).filter((x) => x !== task.id && ids.has(x));
  }
  if ("milestone_id" in clean && clean.milestone_id && !d.milestones.some((m) => m.id === clean.milestone_id)) {
    throw new NotFound("milestone not found in this project");
  }
  if ("parent_id" in clean && clean.parent_id) {
    if (clean.parent_id === task.id) throw new Invalid("a task cannot be its own parent");
    const parent = d.tasks.find((t) => t.id === clean.parent_id);
    if (!parent) throw new NotFound("parent task not found in this project");
    // Every descendant counts, finished ones too; a cycle through a done subtask is still a cycle.
    if (subtree(d, [task.id]).has(parent.id)) {
      throw new Invalid("a task cannot be moved under its own subtask");
    }
    // A subtask lives in its parent's milestone.
    if (!("milestone_id" in clean)) clean.milestone_id = parent.milestone_id;
  }
  if ("milestone_id" in clean && clean.milestone_id !== task.milestone_id) {
    // Subtasks at any depth follow their root task between milestones.
    for (const id of Array.from(subtree(d, [task.id]))) {
      const kid = d.tasks.find((t) => t.id === id);
      if (kid && kid.id !== task.id) kid.milestone_id = (clean.milestone_id as string | null) ?? null;
    }
  }
  let spawned: Task | null = null;
  if ("status" in clean && clean.status !== task.status) {
    task.done_at = clean.status === "done" ? now() : null;
    if (clean.status === "doing") task.claimed_at = now();
    if (clean.status === "done" && task.recurrence) {
      const rule = task.recurrence as Recurrence;
      const t = now();
      const day = today();
      // The day of the month a month-based rule aims for travels with the chore, so a clamped
      // February date does not turn a "30th" chore into a month-end one.
      const anchor = task.recurrence_day ?? dayOfMonth(task.due_date ?? day);
      // Always after today: a chore finished weeks late skips the occurrences it missed.
      const nextDue = nextOccurrenceAfter(rule, task.due_date ?? day, day, anchor);
      spawned = normalizeTask({
        ...task,
        id: newId(),
        // An import identity belongs to one task; the store refuses duplicates.
        source_key: null,
        spawned_from: task.id,
        recurrence_day: anchor,
        status: "todo",
        due_date: nextDue,
        planned_for: null,
        // Deferred until it is due, so an agent does not pick the same chore up again right away.
        snoozed_until: nextDue,
        claimed_at: null,
        done_at: null,
        sort_order: d.tasks.length,
        created_at: t,
        updated_at: t,
      });
      d.tasks.push(spawned);
      task.recurrence = null;
    }
  }
  // A new due date or rule restarts the month anchor from the new date.
  if (("due_date" in clean && clean.due_date !== task.due_date) || ("recurrence" in clean && clean.recurrence !== task.recurrence)) task.recurrence_day = null;
  Object.assign(task, clean, { updated_at: now() });
  if (spawned && "recurrence" in clean) task.recurrence = null;
  touch(d);
  return { spawned };
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

export async function updateTask(id: string, patch: Record<string, unknown>): Promise<{ task: Task; spawned: Task | null }> {
  const clean = pick(patch, TASK_FIELDS);
  return mutate(
    (r, s) => `${pfx(s, r.task.project_id)}${clip(r.task.title)} → ${"status" in clean ? r.task.status : `edit ${Object.keys(clean).join(", ")}`}`,
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
      const { spawned } = applyTaskPatch(d, item as Task, { ...clean });
      return { task: item as Task, spawned };
    }
  );
}

/**
 * Edit many tasks in one commit: `items` carries each task's id and its patch.
 * Tasks may belong to different projects. Any invalid patch aborts the whole batch.
 */
export async function updateTasks(items: Array<Record<string, unknown>>): Promise<{ tasks: Task[]; spawned: Task[] }> {
  if (!items.length) throw new Invalid("items required");
  return mutate(
    (r, s) => {
      const names = Array.from(new Set(r.tasks.map((t) => s.projects.get(t.project_id)?.project.name ?? "?")));
      return `${names.length === 1 ? `${names[0]}: ` : ""}edit ${r.tasks.length} tasks`;
    },
    (s) => {
      const tasks: Task[] = [];
      const spawned: Task[] = [];
      for (const input of items) {
        const id = String(input.id ?? "");
        if (!id) throw new Invalid("every item needs an id");
        const clean = pick(input, TASK_FIELDS.filter((f) => f !== "source_key"));
        const { d, item } = findIn(s, "tasks", id);
        const result = applyTaskPatch(d, item as Task, { ...clean });
        tasks.push(item as Task);
        if (result.spawned) spawned.push(result.spawned);
      }
      return { tasks, spawned };
    }
  );
}

/** Reorder tasks: `order` lists task ids in their new sequence; each may also move to a milestone or parent. */
/** What a reorder changes on each task; the client merges it, and the idempotency receipt stays small. */
export type TaskPlacement = Pick<Task, "id" | "sort_order" | "milestone_id" | "parent_id" | "updated_at">;

export async function reorderTasks(
  projectId: string,
  order: Array<{ id: string; milestone_id?: string | null; parent_id?: string | null }>
): Promise<TaskPlacement[]> {
  return mutate(
    (_r, s) => `${pfx(s, projectId)}reorder plan`,
    (s) => {
      const d = projectIn(s, projectId);
      const byId = new Map(d.tasks.map((t) => [t.id, t]));
      order.forEach((o, i) => {
        const t = byId.get(o.id);
        if (!t) throw new NotFound(`task ${o.id} not found in this project`);
        const patch: Record<string, unknown> = { sort_order: i };
        if (o.milestone_id !== undefined) patch.milestone_id = o.milestone_id;
        if (o.parent_id !== undefined) patch.parent_id = o.parent_id;
        // Moving a task is not progress on it: keep updated_at, which drives the stalled and aging signals.
        const stamp = t.updated_at;
        applyTaskPatch(d, t, patch);
        t.updated_at = stamp;
      });
      // Subtasks at any depth follow the milestone of their root task.
      const rootOf = (t: Task): Task => {
        let cur = t;
        const seen = new Set<string>();
        while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
          seen.add(cur.id);
          cur = byId.get(cur.parent_id)!;
        }
        return cur;
      };
      for (const t of d.tasks) {
        if (!t.parent_id) continue;
        const root = rootOf(t);
        if (root.id !== t.id && t.milestone_id !== root.milestone_id) t.milestone_id = root.milestone_id;
      }
      return d.tasks.map(({ id, sort_order, milestone_id, parent_id, updated_at }) => ({ id, sort_order, milestone_id, parent_id, updated_at }));
    }
  );
}

/** A task and every task beneath it, so deletes take whole subtrees. */
function subtree(d: ProjectDetail, ids: string[]): Set<string> {
  const drop = new Set(ids);
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
  return drop;
}

/** Delete a task and its subtasks. Returns what was removed so the caller can offer undo. */
export async function deleteTask(id: string): Promise<{ removed: Task[] }> {
  const { removed } = await deleteTasks([id]);
  return { removed };
}

/** Delete many tasks (and their subtasks) across projects in one commit. */
export async function deleteTasks(ids: string[]): Promise<{ removed: Task[] }> {
  if (!ids.length) throw new Invalid("ids required");
  return mutate(
    (r) => (r.removed.length === 1 ? `Delete task ${clip(r.removed[0].title)}` : `Delete ${r.removed.length} tasks`),
    (s) => {
      const removed: Task[] = [];
      const byProject = new Map<ProjectDetail, string[]>();
      for (const id of ids) {
        const { d } = findIn(s, "tasks", id);
        byProject.set(d, [...(byProject.get(d) ?? []), id]);
      }
      byProject.forEach((list, d) => {
        const drop = subtree(d, list);
        removed.push(...d.tasks.filter((t) => drop.has(t.id)));
        d.tasks = d.tasks.filter((t) => !drop.has(t.id));
        for (const t of d.tasks) t.depends_on = t.depends_on.filter((x) => !drop.has(x));
        touch(d);
      });
      return { removed };
    }
  );
}

/**
 * Undo a delete: put tasks back with their original ids. Links to things that
 * no longer exist (parent, milestone, dependencies) are dropped rather than
 * left dangling.
 */
export async function restoreTasks(tasks: Task[]): Promise<{ restored: Task[] }> {
  if (!tasks.length) throw new Invalid("tasks required");
  return mutate(
    (r) => (r.restored.length === 1 ? `Restore task ${clip(r.restored[0].title)}` : `Restore ${r.restored.length} tasks`),
    (s) => {
      const restored: Task[] = [];
      const incoming = new Set(tasks.map((t) => t.id));
      // Every id and import key in the store, so a stale or crafted payload cannot write a snapshot parse() refuses.
      const everyId = allRecordIds(s);
      const everyKey = new Map<string, string>();
      for (const [pid, other] of Array.from(s.projects.entries())) {
        for (const t of other.tasks) if (normalizeSourceKey(t.source_key)) everyKey.set(normalizeSourceKey(t.source_key), pid);
      }
      for (const raw of tasks) {
        if (!raw || typeof raw.id !== "string" || typeof raw.project_id !== "string" || typeof raw.title !== "string") {
          throw new Invalid("each task needs id, project_id and title");
        }
        for (const f of ["claimed_at", "done_at", "created_at"] as const) {
          if (raw[f] !== null && raw[f] !== undefined && !(typeof raw[f] === "string" && ISO_RE.test(raw[f] as string))) throw new Invalid(`${f} must be an ISO timestamp or null`);
        }
        const d = projectIn(s, raw.project_id);
        if (d.tasks.some((t) => t.id === raw.id)) continue;
        if (everyId.has(raw.id)) throw new Conflict(`record id ${raw.id} already exists elsewhere`);
        const clean = pick(raw as unknown as Record<string, unknown>, TASK_FIELDS.filter((f) => f !== "source_key"));
        validateTaskFields(clean);
        const ids = new Set([...d.tasks.map((t) => t.id), ...incoming]);
        // Keep the import identity unless another task has taken it meanwhile.
        const key = normalizeSourceKey(raw.source_key);
        const keepKey = key && !everyKey.has(key);
        const task = normalizeTask({
          ...(clean as Partial<Task>),
          ...(keepKey ? { source_key: key } : {}),
          id: raw.id,
          project_id: d.project.id,
          title: raw.title,
          notes: String(clean.notes ?? ""),
          acceptance: String(clean.acceptance ?? ""),
          status: (clean.status as TaskStatus) ?? "todo",
          priority: (clean.priority as Priority) ?? "medium",
          agent: (clean.agent as string | null) ?? null,
          due_date: (clean.due_date as string | null) ?? null,
          estimate: (clean.estimate as number | null) ?? null,
          planned_for: (clean.planned_for as string | null) ?? null,
          recurrence: (clean.recurrence as Recurrence | null) ?? null,
          labels: (clean.labels as string[]) ?? [],
          snoozed_until: (clean.snoozed_until as string | null) ?? null,
          recurrence_day: null,
          spawned_from: null,
          depends_on: ((clean.depends_on as string[]) ?? []).filter((x) => x !== raw.id && ids.has(x)),
          parent_id: clean.parent_id && ids.has(clean.parent_id as string) ? (clean.parent_id as string) : null,
          milestone_id: clean.milestone_id && d.milestones.some((m) => m.id === clean.milestone_id) ? (clean.milestone_id as string) : null,
          sort_order: typeof clean.sort_order === "number" ? clean.sort_order : d.tasks.length,
          claimed_at: raw.claimed_at ?? null,
          done_at: raw.done_at ?? null,
          created_at: raw.created_at || now(),
          updated_at: now(),
        });
        d.tasks.push(task);
        restored.push(task);
        everyId.add(task.id);
        if (keepKey) everyKey.set(key, d.project.id);
        touch(d);
      }
      return { restored };
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
        // Same source_url imported twice: skip it and count it.
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
      addEntry(d, { kind: "progress", task_id: task.parent_id ?? task.id, title: `Added task: ${task.title}`, author: agent });
      return task;
    }
  );
}

/**
 * A comment or progress note on one task, from you or an agent. With `status`
 * the reply and the status change (for example unblocking) land in one commit.
 * An agent's comment (`asAgent`) is checked against the project like every
 * other agent write, and never changes status.
 */
export async function commentOnTask(
  taskId: string,
  author: string,
  body: string,
  opts: { status?: TaskStatus; asAgent?: boolean } = {}
): Promise<{ entry: Entry; task: Task; spawned: Task | null }> {
  if (!body.trim()) throw new Invalid("say something");
  const status = opts.asAgent ? undefined : opts.status;
  if (status && !(TASK_STATUSES as readonly string[]).includes(status)) throw new Invalid(`status must be one of ${TASK_STATUSES.join(", ")}`);
  // Read before the patch, so the commit message can say what changed.
  let changed = false;
  return mutate(
    (r, s) => `${pfx(s, r.task.project_id)}${changed ? "reply and set " + status + " on" : "comment on"} ${clip(r.task.title)}${by(author)}`,
    (s) => {
      const { d, item } = findIn(s, "tasks", taskId);
      const task = item as Task;
      if (opts.asAgent) assertAgentProject(d, author);
      changed = !!status && status !== task.status;
      const entry = addEntry(d, { kind: "progress", task_id: task.id, title: body.trim().split("\n")[0].slice(0, 140), body: body.trim(), author });
      const { spawned } = status && status !== task.status ? applyTaskPatch(d, task, { status }) : { spawned: null };
      task.updated_at = now();
      touch(d);
      return { entry, task, spawned };
    }
  );
}

/**
 * Undo finishing a task in one commit: reopen it, give its recurrence rule
 * back, and remove the occurrence that finishing it spawned, as long as nobody
 * has started that occurrence meanwhile. While a live occurrence still carries
 * the rule, the reopened task does not get it back (one chore, one rule); an
 * occurrence that is gone leaves nothing to keep it, so the rule comes back.
 * Only the occurrence this task spawned (`spawned_from`) can be taken back.
 */
export async function reopenTask(
  id: string,
  input: { status?: TaskStatus; recurrence?: Recurrence | null; planned_for?: string | null; spawned_id?: string }
): Promise<{ task: Task; removed: Task[] }> {
  const status = input.status ?? "todo";
  if (status === "done") throw new Invalid("reopen needs an open status");
  return mutate(
    (r, s) => `${pfx(s, r.task.project_id)}reopen ${clip(r.task.title)}`,
    (s) => {
      const { d, item } = findIn(s, "tasks", id);
      const task = item as Task;
      const removed: Task[] = [];
      const spawned = input.spawned_id ? d.tasks.find((t) => t.id === input.spawned_id) : undefined;
      if (spawned && spawned.spawned_from !== task.id) throw new Invalid("spawned_id is not an occurrence of this task");
      if (spawned && spawned.status === "todo" && spawned.recurrence) {
        const drop = subtree(d, [spawned.id]);
        removed.push(...d.tasks.filter((t) => drop.has(t.id)));
        d.tasks = d.tasks.filter((t) => !drop.has(t.id));
        for (const t of d.tasks) t.depends_on = t.depends_on.filter((x) => !drop.has(x));
      }
      const occurrenceKeepsRule = !!spawned && !removed.length && !!spawned.recurrence;
      const patch: Record<string, unknown> = { status };
      if ("recurrence" in input && !occurrenceKeepsRule) patch.recurrence = input.recurrence ?? null;
      if ("planned_for" in input) patch.planned_for = input.planned_for ?? null;
      applyTaskPatch(d, task, patch);
      return { task, removed };
    }
  );
}

/**
 * One review pass over a project in one commit: stamp it reviewed, and
 * optionally set the next action, change status, and post a status update.
 */
export async function reviewProject(
  id: string,
  input: { next_action?: string; status?: ProjectStatus; status_note?: string; update?: { health: string; body: string } }
): Promise<{ project: Project; entries: Entry[] }> {
  if (input.status && !STATUSES.includes(input.status)) throw new Invalid(`status must be one of ${STATUSES.join(", ")}`);
  if (input.update && (!(HEALTH_LEVELS as readonly string[]).includes(input.update.health) || !String(input.update.body ?? "").trim())) {
    throw new Invalid("an update needs a health call and a few words");
  }
  return mutate(
    (r) => `${r.project.name}: reviewed${input.status ? `, now ${input.status}` : ""}${input.update ? ", update posted" : ""}`,
    (s) => {
      const d = projectIn(s, id);
      const entries: Entry[] = [];
      const stamp = now();
      d.project.last_reviewed_at = stamp;
      if (typeof input.next_action === "string") d.project.next_action = input.next_action.trim();
      if (input.status && input.status !== d.project.status) {
        const before = d.project.status;
        d.project.status = input.status;
        d.project.status_changed_at = stamp;
        entries.push(addEntry(d, { kind: "status", title: `${STATUS_META[before].label} → ${STATUS_META[input.status].label}`, body: input.status_note ?? "" }));
      }
      if (input.update) {
        entries.push(addEntry(d, { kind: "update", title: `Review ${today()}`, body: input.update.body.trim(), health: input.update.health, author: ME, entry_date: today() }));
      }
      touch(d);
      return { project: d.project, entries };
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
  if ("title" in clean && !String(clean.title ?? "").trim()) throw new Invalid("title required");
  return mutate(
    (e, s) => `${pfx(s, e.project_id)}${clip(e.title)} → ${clean.decision_status ?? "edited"}`,
    (s) => {
      const { d, item } = findIn(s, "entries", id);
      validateEntryFields(d, clean);
      const next = { ...(item as Entry), ...clean } as Entry;
      if (next.kind === "update" && !next.health) throw new Invalid("a status update needs a health call");
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
      addEntry(d, { kind: "progress", task_id: task.id, title: `Started: ${task.title}`, author: agent });
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
      addEntry(d, { kind: "progress", task_id: task.id, title: `${verb}: ${task.title}`, body: input.note ?? "", author: agent });
      return task;
    }
  );
}

// ─────────── inbox ───────────

export async function listInbox(): Promise<InboxItem[]> {
  const s = await readSnapshot();
  return [...s.inbox.items].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function cleanInbox(input: Record<string, unknown>): Record<string, unknown> {
  const clean = pick(input, INBOX_FIELDS);
  if ("title" in clean && !String(clean.title ?? "").trim()) throw new Invalid("title required");
  if ("title" in clean) clean.title = String(clean.title).trim();
  if ("notes" in clean) clean.notes = String(clean.notes ?? "");
  if ("source" in clean) clean.source = clean.source ? String(clean.source).slice(0, 64) : null;
  if ("project_id" in clean) clean.project_id = clean.project_id ? String(clean.project_id) : null;
  const taskish: Record<string, unknown> = {};
  for (const f of ["agent", "priority", "due_date", "planned_for", "recurrence", "estimate", "labels"] as const) if (f in clean) taskish[f] = clean[f];
  if ("priority" in taskish && taskish.priority === null) delete taskish.priority;
  validateTaskFields(taskish);
  Object.assign(clean, taskish);
  if ("priority" in clean && !clean.priority) clean.priority = null;
  return clean;
}

/** Capture a thought. It waits in the inbox until it is sorted into a project. */
export async function captureInbox(input: Record<string, unknown>): Promise<InboxItem> {
  const clean = cleanInbox({ title: "", ...input });
  return mutate(
    (i) => `Inbox: ${clip(i.title)}`,
    (s) => {
      if (clean.project_id && !s.projects.has(clean.project_id as string)) throw new NotFound("project not found");
      const item: InboxItem = {
        id: newId(),
        title: "",
        notes: "",
        source: ME,
        project_id: null,
        agent: null,
        priority: null,
        due_date: null,
        planned_for: null,
        recurrence: null,
        estimate: null,
        labels: [],
        created_at: now(),
        ...(clean as Partial<InboxItem>),
      };
      s.inbox.items.push(item);
      return item;
    }
  );
}

export async function updateInboxItem(id: string, patch: Record<string, unknown>): Promise<InboxItem> {
  const clean = cleanInbox(patch);
  return mutate(
    (i) => `Inbox: edit ${clip(i.title)}`,
    (s) => {
      const item = s.inbox.items.find((x) => x.id === id);
      if (!item) throw new NotFound("inbox item not found");
      if (clean.project_id && !s.projects.has(clean.project_id as string)) throw new NotFound("project not found");
      Object.assign(item, clean);
      return item;
    }
  );
}

export async function deleteInboxItem(id: string): Promise<InboxItem> {
  return mutate(
    (i) => `Inbox: drop ${clip(i.title)}`,
    (s) => {
      const item = s.inbox.items.find((x) => x.id === id);
      if (!item) throw new NotFound("inbox item not found");
      s.inbox.items = s.inbox.items.filter((x) => x.id !== id);
      return item;
    }
  );
}

/**
 * Turn a capture into a task. The item's hints are the defaults; `input` can
 * override any of them and must name the project. One commit removes the
 * capture and adds the task, so a retry cannot create two.
 */
export async function triageInbox(id: string, input: Record<string, unknown>): Promise<{ task: Task }> {
  return mutate(
    (r, s) => `${pfx(s, r.task.project_id)}add ${clip(r.task.title)} from inbox`,
    (s) => {
      const item = s.inbox.items.find((x) => x.id === id);
      if (!item) throw new NotFound("inbox item not found");
      const projectId = String(input.project_id ?? item.project_id ?? "");
      if (!projectId) throw new Invalid("pick a project");
      const d = projectIn(s, projectId);
      // Every hint the capture carried comes along; items written before a field existed read as null.
      const fields: Record<string, unknown> = {
        title: item.title,
        notes: item.notes,
        agent: item.agent,
        priority: item.priority ?? "medium",
        due_date: item.due_date,
        planned_for: item.planned_for ?? null,
        recurrence: item.recurrence ?? null,
        estimate: item.estimate,
        labels: item.labels,
      };
      const overrides = pick(input, TASK_FIELDS.filter((f) => f !== "source_key"));
      for (const [k, v] of Object.entries(overrides)) if (v !== undefined) fields[k] = v;
      const task = newTask(d, fields);
      s.inbox.items = s.inbox.items.filter((x) => x.id !== id);
      return { task };
    }
  );
}

// ─────────── history ───────────

export function historyAvailable(): boolean {
  try {
    return storeHasHistory();
  } catch {
    return false;
  }
}

/** Recent commits to the data store, optionally only those that touched one project. */
export async function getHistory(projectId?: string, limit = 50): Promise<HistoryEntry[]> {
  if (projectId && !/^[\w-]+$/.test(projectId)) throw new Invalid("bad project id");
  return listHistory(limit, projectId ? `projects/${projectId}.json` : undefined);
}

/** A project as it was at a commit, parsed and normalized; null when it did not exist. */
export async function getProjectAt(id: string, sha: string): Promise<ProjectDetail | null> {
  if (!/^[\w-]+$/.test(id)) throw new Invalid("bad project id");
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Invalid("bad commit id");
  const text = await readFileAt(sha, `projects/${id}.json`);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Invalid("that version is not valid JSON");
  }
  checkDetailShape(parsed, id);
  return ordered(normalizeDetail(parsed));
}

/** The checks the store applies when it reads a project file, for a version pulled from history. */
function checkDetailShape(parsed: unknown, id: string): asserts parsed is ProjectDetail {
  const d = parsed as (ProjectDetail & { schemaVersion?: unknown }) | null;
  if (
    !d || typeof d !== "object" || !d.project || typeof d.project !== "object" || d.project.id !== id || typeof d.project.name !== "string" ||
    !Array.isArray(d.project.agents) || !Array.isArray(d.tasks) || !Array.isArray(d.milestones) || !Array.isArray(d.entries) ||
    (d.schemaVersion !== undefined && d.schemaVersion !== 1)
  ) {
    throw new Invalid("that version is not a project record");
  }
  const ids = new Set<string>([id]);
  for (const row of [...d.milestones, ...d.tasks, ...d.entries] as Array<{ id?: unknown; project_id?: unknown } | null>) {
    if (!row || typeof row.id !== "string" || row.project_id !== id || ids.has(row.id)) throw new Invalid("that version holds an invalid or duplicate record");
    ids.add(row.id);
  }
  const keys = new Set<string>();
  for (const t of d.tasks as Array<{ source_key?: unknown }>) {
    const key = t.source_key;
    if (key === null || key === undefined) continue;
    if (typeof key !== "string" || !key.trim() || key !== key.trim() || keys.has(key)) throw new Invalid("that version holds an invalid or duplicate task source_key");
    keys.add(key);
  }
}

/** Put a project back the way it was at a commit. Logged on the project itself. */
export async function restoreProject(id: string, sha: string): Promise<ProjectDetail> {
  const past = await getProjectAt(id, sha);
  if (!past) throw new NotFound("the project did not exist at that commit");
  return mutate(
    (d) => `${d.project.name}: restore version ${sha.slice(0, 7)}`,
    (s) => {
      const current = s.projects.get(id);
      // Another record may hold the same id or import key only if a file was copied; refuse that,
      // because the store refuses to read a snapshot with duplicates. The project's own current
      // rows are being replaced, so they do not count.
      const taken = allRecordIds(s);
      if (current) for (const x of [...current.tasks, ...current.milestones, ...current.entries]) taken.delete(x.id);
      if ([...past.tasks, ...past.milestones, ...past.entries].some((x) => taken.has(x.id))) {
        throw new Conflict("that version shares record ids with another record in the store");
      }
      const pastKeys = new Set(past.tasks.map((t) => normalizeSourceKey(t.source_key)).filter(Boolean));
      for (const [otherId, other] of Array.from(s.projects.entries())) {
        if (otherId === id) continue;
        if (other.tasks.some((t) => pastKeys.has(normalizeSourceKey(t.source_key)))) {
          throw new Conflict("that version shares task source keys with another project");
        }
      }
      const restored: ProjectDetail = structuredClone(past);
      restored.project.updated_at = now();
      if (current) restored.project.status_changed_at = current.project.status === restored.project.status ? current.project.status_changed_at : now();
      addEntry(restored, {
        kind: "progress",
        title: `Restored the project to its version from ${past.project.updated_at.slice(0, 10)} (${sha.slice(0, 7)})`,
        author: ME,
      });
      s.projects.set(id, restored);
      return restored;
    }
  );
}

