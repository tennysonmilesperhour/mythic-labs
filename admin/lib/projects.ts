import { serviceClient, ADMIN_USER_ID } from "./supabase";
import {
  computeStats,
  STATUSES,
  STATUS_META,
  type Entry,
  type Milestone,
  type Project,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary,
  type Task,
  type TimelineItem,
} from "./projectTypes";

// See supabase/migrations/0002_project_manager.sql.
const T_PROJECTS = "mythic_projects";
const T_MILESTONES = "mythic_milestones";
const T_TASKS = "mythic_tasks";
const T_ENTRIES = "mythic_project_entries";

const PROJECT_FIELDS = [
  "name", "owner", "repo", "status", "priority", "summary", "description",
  "next_action", "tags", "agents", "tools", "links", "start_date",
  "target_date", "sort_order",
] as const;
const MILESTONE_FIELDS = [
  "title", "description", "start_date", "target_date", "done", "sort_order",
] as const;
const TASK_FIELDS = [
  "title", "notes", "status", "priority", "agent", "due_date", "milestone_id",
  "parent_id", "sort_order",
] as const;
const ENTRY_FIELDS = [
  "kind", "title", "body", "entry_date", "version", "change_type", "source_url",
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

export async function listProjectSummaries(): Promise<{
  projects: ProjectSummary[];
  timeline: TimelineItem[];
}> {
  const db = serviceClient();
  const { data: projects, error } = await db
    .from(T_PROJECTS)
    .select("*")
    .eq("user_id", ADMIN_USER_ID)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const ids = (projects || []).map((p) => p.id as string);
  if (!ids.length) return { projects: [], timeline: [] };

  const [tasksRes, msRes, entRes] = await Promise.all([
    db.from(T_TASKS).select("project_id, milestone_id, status, due_date, updated_at").in("project_id", ids),
    db.from(T_MILESTONES).select("*").in("project_id", ids),
    db.from(T_ENTRIES).select("project_id, created_at").in("project_id", ids),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (msRes.error) throw msRes.error;
  if (entRes.error) throw entRes.error;
  const tasks = tasksRes.data as Pick<Task, "project_id" | "milestone_id" | "status" | "due_date" | "updated_at">[];
  const milestones = msRes.data as Milestone[];
  const entries = entRes.data as Pick<Entry, "project_id" | "created_at">[];

  const summaries = (projects as Project[]).map((p) => ({
    ...p,
    stats: computeStats(
      tasks.filter((t) => t.project_id === p.id),
      milestones.filter((m) => m.project_id === p.id),
      [...entries.filter((e) => e.project_id === p.id).map((e) => e.created_at), p.updated_at]
    ),
  }));

  const byId = new Map(summaries.map((p) => [p.id, p]));
  const timeline = milestones
    .map((m) => {
      const mt = tasks.filter((t) => t.milestone_id === m.id);
      const p = byId.get(m.project_id)!;
      return {
        ...m,
        project_name: p.name,
        project_status: p.status,
        tasks_total: mt.length,
        tasks_done: mt.filter((t) => t.status === "done").length,
      };
    })
    .sort((a, b) =>
      (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999")
    );

  return { projects: summaries, timeline };
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
