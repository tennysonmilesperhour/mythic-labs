import { serviceClient, ADMIN_USER_ID } from "./supabase";
import {
  SOON_DAYS,
  STATUSES,
  STATUS_META,
  WORKABLE,
  computeAttention,
  computeStats,
  daysFromNow,
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

// See supabase/migrations/0002_project_manager.sql.
const T_PROJECTS = "mythic_projects";
const T_MILESTONES = "mythic_milestones";
const T_TASKS = "mythic_tasks";
const T_ENTRIES = "mythic_project_entries";

const PROJECT_FIELDS = [
  "name", "owner", "repo", "status", "priority", "summary", "description",
  "next_action", "agent_instructions", "tags", "agents", "tools", "links", "start_date",
  "target_date", "sort_order",
] as const;
const MILESTONE_FIELDS = [
  "title", "description", "start_date", "target_date", "done", "sort_order",
] as const;
const TASK_FIELDS = [
  "title", "notes", "acceptance", "depends_on", "status", "priority", "agent",
  "due_date", "milestone_id", "parent_id", "sort_order",
] as const;
const ENTRY_FIELDS = [
  "kind", "title", "body", "entry_date", "author", "version", "change_type", "source_url",
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

async function assertOwnsProject(projectId: string): Promise<Project> {
  const { data, error } = await serviceClient()
    .from(T_PROJECTS)
    .select("*")
    .eq("id", projectId)
    .eq("user_id", ADMIN_USER_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound("project not found");
  return data as Project;
}

async function projectIdOf(table: string, id: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from(table)
    .select("project_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound("not found");
  await assertOwnsProject(data.project_id as string);
  return data.project_id as string;
}

async function touch(projectId: string) {
  await serviceClient()
    .from(T_PROJECTS)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId);
}

// ─────────── projects ───────────

/** Every project with its plan and log. Single-admin, so one pass is fine. */
export async function loadAll(): Promise<ProjectDetail[]> {
  const db = serviceClient();
  const { data: projects, error } = await db
    .from(T_PROJECTS)
    .select("*")
    .eq("user_id", ADMIN_USER_ID);
  if (error) throw error;
  const ids = (projects || []).map((p) => p.id as string);
  if (!ids.length) return [];

  const [tasksRes, msRes, entRes] = await Promise.all([
    db.from(T_TASKS).select("*").in("project_id", ids),
    db.from(T_MILESTONES).select("*").in("project_id", ids),
    db.from(T_ENTRIES).select("*").in("project_id", ids)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (msRes.error) throw msRes.error;
  if (entRes.error) throw entRes.error;
  const tasks = tasksRes.data as Task[];
  const milestones = msRes.data as Milestone[];
  const entries = entRes.data as Entry[];

  return (projects as Project[]).map((project) => ({
    project,
    tasks: tasks.filter((t) => t.project_id === project.id),
    milestones: milestones.filter((m) => m.project_id === project.id),
    entries: entries.filter((e) => e.project_id === project.id),
  }));
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
    attention: sortAttention(projects.flatMap((p) => p.attention), projects),
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

export async function getProjectDetail(id: string): Promise<ProjectDetail> {
  const project = await assertOwnsProject(id);
  const db = serviceClient();
  const [ms, ts, es] = await Promise.all([
    db.from(T_MILESTONES).select("*").eq("project_id", id).order("sort_order").order("created_at"),
    db.from(T_TASKS).select("*").eq("project_id", id).order("sort_order").order("created_at"),
    db.from(T_ENTRIES).select("*").eq("project_id", id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (ms.error) throw ms.error;
  if (ts.error) throw ts.error;
  if (es.error) throw es.error;
  return {
    project,
    milestones: ms.data as Milestone[],
    tasks: ts.data as Task[],
    entries: es.data as Entry[],
  };
}

export async function createProjects(
  rows: Array<Record<string, unknown>>
): Promise<{ created: Project[]; failed: Array<{ name: string; reason: string }> }> {
  const created: Project[] = [];
  const failed: Array<{ name: string; reason: string }> = [];
  for (const row of rows) {
    const clean = pick(row, PROJECT_FIELDS);
    const name = String(clean.name || (clean.repo ?? "")).trim();
    if (!name) {
      failed.push({ name: "(blank)", reason: "name required" });
      continue;
    }
    const { data, error } = await serviceClient()
      .from(T_PROJECTS)
      .insert({ ...clean, name, user_id: ADMIN_USER_ID })
      .select()
      .single();
    if (error) {
      failed.push({
        name,
        reason: error.code === "23505" ? "already tracked" : error.message,
      });
    } else {
      created.push(data as Project);
    }
  }
  return { created, failed };
}

export async function updateProject(
  id: string,
  patch: Record<string, unknown>
): Promise<{ project: Project; entry: Entry | null }> {
  const before = await assertOwnsProject(id);
  const clean = pick(patch, PROJECT_FIELDS);
  if (clean.status && !STATUSES.includes(clean.status as ProjectStatus)) {
    throw new Error(`status must be one of ${STATUSES.join(", ")}`);
  }
  const statusChanged = !!clean.status && clean.status !== before.status;
  const now = new Date().toISOString();
  const { data, error } = await serviceClient()
    .from(T_PROJECTS)
    .update({
      ...clean,
      updated_at: now,
      ...(statusChanged ? { status_changed_at: now } : {}),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  let entry: Entry | null = null;
  if (statusChanged) {
    const from = STATUS_META[before.status].label;
    const to = STATUS_META[clean.status as ProjectStatus].label;
    entry = await insertEntry(id, {
      kind: "status",
      title: `${from} → ${to}`,
      body: typeof patch.status_note === "string" ? patch.status_note : "",
    });
  }
  return { project: data as Project, entry };
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await serviceClient()
    .from(T_PROJECTS)
    .delete()
    .eq("id", id)
    .eq("user_id", ADMIN_USER_ID);
  if (error) throw error;
}

// ─────────── milestones ───────────

export async function createMilestone(
  projectId: string,
  input: Record<string, unknown>
): Promise<Milestone> {
  await assertOwnsProject(projectId);
  const clean = pick(input, MILESTONE_FIELDS);
  if (!String(clean.title || "").trim()) throw new Error("title required");
  const { data, error } = await serviceClient()
    .from(T_MILESTONES)
    .insert({ ...clean, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  await touch(projectId);
  return data as Milestone;
}

export async function updateMilestone(
  id: string,
  patch: Record<string, unknown>
): Promise<Milestone> {
  const projectId = await projectIdOf(T_MILESTONES, id);
  const clean = pick(patch, MILESTONE_FIELDS);
  if ("done" in clean) clean.done_at = clean.done ? new Date().toISOString() : null;
  const { data, error } = await serviceClient()
    .from(T_MILESTONES)
    .update(clean)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  await touch(projectId);
  return data as Milestone;
}

export async function deleteMilestone(id: string): Promise<void> {
  const projectId = await projectIdOf(T_MILESTONES, id);
  const { error } = await serviceClient().from(T_MILESTONES).delete().eq("id", id);
  if (error) throw error;
  await touch(projectId);
}

// ─────────── tasks ───────────

export async function createTask(
  projectId: string,
  input: Record<string, unknown>
): Promise<Task> {
  await assertOwnsProject(projectId);
  const clean = pick(input, TASK_FIELDS);
  if (!String(clean.title || "").trim()) throw new Error("title required");
  if (clean.status === "done") clean.done_at = new Date().toISOString();
  if (clean.parent_id && !clean.milestone_id) {
    // Subtasks live in their parent's milestone.
    const { data: parent } = await serviceClient()
      .from(T_TASKS)
      .select("project_id, milestone_id")
      .eq("id", clean.parent_id as string)
      .maybeSingle();
    if (!parent || parent.project_id !== projectId) throw new NotFound("parent task not found in this project");
    clean.milestone_id = parent.milestone_id;
  }
  const { data, error } = await serviceClient()
    .from(T_TASKS)
    .insert({ ...clean, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  await touch(projectId);
  return data as Task;
}

export async function updateTask(
  id: string,
  patch: Record<string, unknown>
): Promise<Task> {
  const projectId = await projectIdOf(T_TASKS, id);
  const clean = pick(patch, TASK_FIELDS);
  if ("status" in clean) {
    clean.done_at = clean.status === "done" ? new Date().toISOString() : null;
    if (clean.status === "doing") clean.claimed_at = new Date().toISOString();
  }
  if (Array.isArray(clean.depends_on)) {
    clean.depends_on = (clean.depends_on as string[]).filter((d) => d !== id);
  }
  const { data, error } = await serviceClient()
    .from(T_TASKS)
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  await touch(projectId);
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const projectId = await projectIdOf(T_TASKS, id);
  const { error } = await serviceClient().from(T_TASKS).delete().eq("id", id);
  if (error) throw error;
  await touch(projectId);
}

// ─────────── entries ───────────

async function insertEntry(
  projectId: string,
  input: Record<string, unknown>
): Promise<Entry> {
  const clean = pick(input, ENTRY_FIELDS);
  if (!String(clean.title || "").trim()) throw new Error("title required");
  const { data, error } = await serviceClient()
    .from(T_ENTRIES)
    .insert({ ...clean, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return data as Entry;
}

export async function createEntries(
  projectId: string,
  inputs: Array<Record<string, unknown>>
): Promise<{ created: Entry[]; skipped: number }> {
  await assertOwnsProject(projectId);
  const created: Entry[] = [];
  let skipped = 0;
  for (const input of inputs) {
    try {
      created.push(await insertEntry(projectId, input));
    } catch (err: unknown) {
      // Same source_url imported twice: skip quietly.
      if ((err as { code?: string }).code === "23505") skipped++;
      else throw err;
    }
  }
  await touch(projectId);
  return { created, skipped };
}

export async function updateEntry(
  id: string,
  patch: Record<string, unknown>
): Promise<Entry> {
  const projectId = await projectIdOf(T_ENTRIES, id);
  const { data, error } = await serviceClient()
    .from(T_ENTRIES)
    .update(pick(patch, ENTRY_FIELDS))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  await touch(projectId);
  return data as Entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const projectId = await projectIdOf(T_ENTRIES, id);
  const { error } = await serviceClient().from(T_ENTRIES).delete().eq("id", id);
  if (error) throw error;
  await touch(projectId);
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
  const all = sortProjects(
    (await loadAll()).map((d) => ({ ...d.project, d }))
  ).map((x) => x.d);
  for (const d of all) {
    if (projectId && d.project.id !== projectId) continue;
    if (!WORKABLE.includes(d.project.status)) continue;
    // Unassigned work only from projects that list this agent (or list none).
    const open = !d.project.agents.length || d.project.agents.includes(agent);
    const task = rankReady(d.tasks, d.milestones).find(
      (t) => t.agent === agent || (!t.agent && open)
    );
    if (task) return { task, detail: d };
  }
  return null;
}

async function logProgress(projectId: string, title: string, body: string, author: string | null) {
  await insertEntry(projectId, { kind: "progress", title, body, author });
}

export async function claimTask(id: string, agent: string): Promise<Task> {
  const projectId = await projectIdOf(T_TASKS, id);
  const detail = await getProjectDetail(projectId);
  const task = detail.tasks.find((t) => t.id === id)!;
  if (task.status === "doing" && task.agent && task.agent !== agent) {
    throw new Conflict(`already claimed by @${task.agent}`);
  }
  if (task.status !== "doing" && !isReady(task, detail.tasks)) {
    throw new Conflict(`not ready (status ${task.status}, or waiting on dependencies or subtasks)`);
  }
  const updated = await updateTask(id, { status: "doing", agent });
  await logProgress(projectId, `Started: ${task.title}`, "", agent);
  return updated;
}

/** Status change and/or progress note from an agent; the note is logged. */
export async function reportTask(
  id: string,
  agent: string,
  input: { status?: string; note?: string }
): Promise<Task> {
  const projectId = await projectIdOf(T_TASKS, id);
  if (input.status === "done") {
    const { tasks } = await getProjectDetail(projectId);
    const open = openDescendants(tasks.find((t) => t.id === id)!, tasks);
    if (open.length) {
      throw new Conflict(`finish or remove its open subtasks first: ${open.map((t) => t.title).join("; ")}`);
    }
  }
  const patch: Record<string, unknown> = {};
  if (input.status) patch.status = input.status;
  const task = await updateTask(id, patch); // an empty patch still bumps updated_at
  const verb =
    input.status === "done" ? "Finished" :
    input.status === "blocked" ? "Blocked" :
    input.status === "todo" ? "Released" : "Progress";
  await logProgress(projectId, `${verb}: ${task.title}`, input.note ?? "", agent);
  return task;
}
