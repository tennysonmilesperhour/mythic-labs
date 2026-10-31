"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { projectHref } from "@/lib/taskMap";
import { api } from "@/components/ProjectBits";
import { importEntryIdentity, nameMatchCompatible, projectNameIsAmbiguous, safeImportSourceUrl, sameResolvedOwner, validImportDate, validImportProjectKey } from "@/lib/importIdentity";

type ProjectStatus = "active" | "building" | "planned" | "paused";
type TaskStatus = "todo" | "blocked";
type TaskInput = {
  source_key: string;
  project_key: string;
  title: string;
  status: TaskStatus;
  priority?: "critical" | "high" | "medium" | "low";
  notes?: string;
  acceptance?: string;
  due_date?: string | null;
};
type ProjectInput = {
  source_key: string;
  name: string;
  owner?: string | null;
  repo?: string | null;
  status?: ProjectStatus;
  priority?: "critical" | "high" | "medium" | "low";
  summary?: string;
  description?: string;
  next_action?: string;
  tags?: string[];
};
type EntryInput = {
  source_key: string;
  project_key: string;
  evidence_url?: string;
  title: string;
  body: string;
  entry_date: string;
  kind: "note" | "decision";
  decision_status?: "proposed" | "accepted" | "superseded" | "rejected";
};
type Manifest = {
  schema_version: "mythic-import-v1";
  projects: ProjectInput[];
  tasks: TaskInput[];
  entries: EntryInput[];
};

export type ImportProjectState = {
  id: string;
  name: string;
  owner: string | null;
  repo: string | null;
  source_key: string | null;
  status: ProjectStatus;
  task_source_keys: string[];
  entry_source_urls: string[];
};

type Plan = {
  manifest: Manifest;
  matches: Map<string, ImportProjectState>;
  projectsToCreate: ProjectInput[];
  tasksToCreate: Map<string, TaskInput[]>;
  entriesToCreate: Map<string, EntryInput[]>;
  errors: string[];
  taskSkipped: number;
  entrySkipped: number;
};

const template = {
  schema_version: "mythic-import-v1",
  projects: [{ source_key: "area:personal-admin", name: "Personal & Admin", status: "planned", priority: "medium", summary: "Private task summaries only." }],
  tasks: [{ source_key: "inventory:example-001", project_key: "area:personal-admin", title: "Example task", status: "todo", priority: "medium", notes: "Owner: assistant. Next: verify the current state. Historical evidence date: 2026-10-27. No task execution authority is implied." }],
  entries: [{ source_key: "weekly-report:2026-10-26:America/Denver", project_key: "tennysonmilesperhour/mythic-labs", title: "October 27 baseline / week of October 26", body: "Private report body", entry_date: "2026-10-27", kind: "note" }],
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && !!value.trim();
}
function makePlan(text: string, current: ImportProjectState[]): Plan {
  const errors: string[] = [];
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { manifest: { schema_version: "mythic-import-v1", projects: [], tasks: [], entries: [] }, matches: new Map(), projectsToCreate: [], tasksToCreate: new Map(), entriesToCreate: new Map(), errors: ["Manifest is not valid JSON."], taskSkipped: 0, entrySkipped: 0 }; }
  if (!object(raw) || raw.schema_version !== "mythic-import-v1") errors.push("schema_version must be mythic-import-v1.");
  const projectRows = object(raw) && Array.isArray(raw.projects) ? raw.projects : [];
  const taskRows = object(raw) && Array.isArray(raw.tasks) ? raw.tasks : [];
  const entryRows = object(raw) && Array.isArray(raw.entries) ? raw.entries : [];
  if (!Array.isArray(object(raw) ? raw.projects : null)) errors.push("projects must be an array.");
  if (!Array.isArray(object(raw) ? raw.tasks : null)) errors.push("tasks must be an array.");
  if (!Array.isArray(object(raw) ? raw.entries : null)) errors.push("entries must be an array.");

  const projects = projectRows.filter(object) as unknown as ProjectInput[];
  const tasks = taskRows.filter(object) as unknown as TaskInput[];
  const entries = entryRows.filter(object) as unknown as EntryInput[];
  if (projects.length !== projectRows.length || tasks.length !== taskRows.length || entries.length !== entryRows.length) errors.push("Every array item must be an object.");
  const projectKeys = new Set<string>();
  const manifestRepoKeys = new Set<string>();
  for (const [i, p] of projects.entries()) {
    if (!validImportProjectKey(p.source_key, p.name)) { errors.push(`projects[${i}] requires a trimmed source_key and a non-empty name.`); continue; }
    if (projectKeys.has(p.source_key)) { errors.push(`Duplicate project source_key: ${p.source_key}.`); continue; }
    projectKeys.add(p.source_key);
    if (p.owner && !p.repo || !p.owner && p.repo) errors.push(`projects[${i}] must supply both owner and repo or neither.`);
    if ((p.owner !== undefined && p.owner !== null && typeof p.owner !== "string") || (p.repo !== undefined && p.repo !== null && typeof p.repo !== "string")) { errors.push(`projects[${i}] owner/repo must be strings or null.`); continue; }
    if (typeof p.owner === "string" && p.owner && typeof p.repo === "string" && p.repo) {
      const key = `${p.owner}/${p.repo}`.toLowerCase();
      if (manifestRepoKeys.has(key)) errors.push(`Duplicate owner/repo mapping: ${p.owner}/${p.repo}.`);
      manifestRepoKeys.add(key);
    }
    if (p.status && !["active", "building", "planned", "paused"].includes(p.status)) errors.push(`projects[${i}] has an unsupported status.`);
    if (p.priority && !["critical", "high", "medium", "low"].includes(p.priority)) errors.push(`projects[${i}] has an unsupported priority.`);
  }

  const matches = new Map<string, ImportProjectState>();
  const projectsToCreate: ProjectInput[] = [];
  for (const p of projects) {
    if (!validImportProjectKey(p.source_key, p.name)) continue;
    if ((p.owner !== undefined && p.owner !== null && typeof p.owner !== "string") || (p.repo !== undefined && p.repo !== null && typeof p.repo !== "string")) continue;
    const bySource = current.find((x) => x.source_key?.trim() === p.source_key.trim());
    const byRepo = p.owner && p.repo ? current.find((x) => `${x.owner}/${x.repo}`.toLowerCase() === `${p.owner}/${p.repo}`.toLowerCase()) : undefined;
    const byNameRows = current.filter((x) => x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    const directMatch = bySource || byRepo;
    if (projectNameIsAmbiguous(!!directMatch, byNameRows.length)) errors.push(`Project name ${p.name} matches multiple existing records; add an owner/repo or choose a unique category name.`);
    const byName = !directMatch && byNameRows.length === 1 ? byNameRows[0] : undefined;
    if (bySource && byRepo && bySource.id !== byRepo.id) errors.push(`Project ${p.source_key} resolves to two different existing records.`);
    if (bySource && byName && bySource.id !== byName.id || byRepo && byName && byRepo.id !== byName.id) errors.push(`Project ${p.source_key} name mapping conflicts with another existing record.`);
    if (bySource && p.owner && p.repo && (bySource.owner?.toLowerCase() !== p.owner.toLowerCase() || bySource.repo?.toLowerCase() !== p.repo.toLowerCase())) errors.push(`Project source_key ${p.source_key} conflicts with the existing owner/repo mapping.`);
    if (!directMatch && byName && !nameMatchCompatible(p.owner, p.repo, byName.owner, byName.repo)) {
      errors.push(`Project ${p.name} matches an existing name with a different owner/repo; supply the correct existing mapping.`);
      continue;
    }
    const found = directMatch || byName;
    if (found) matches.set(p.source_key, found);
    else projectsToCreate.push(p);
  }

  const seenTaskKeys = new Set<string>();
  const tasksToCreate = new Map<string, TaskInput[]>();
  let taskSkipped = 0;
  for (const [i, task] of tasks.entries()) {
    if (!nonEmpty(task.source_key) || !nonEmpty(task.project_key) || !nonEmpty(task.title)) { errors.push(`tasks[${i}] requires source_key, project_key and title.`); continue; }
    if (task.source_key !== task.source_key.trim() || task.project_key !== task.project_key.trim()) { errors.push(`tasks[${i}] source_key and project_key must be trimmed.`); continue; }
    if (!projectKeys.has(task.project_key) && !current.some((x) => x.source_key === task.project_key || `${x.owner}/${x.repo}`.toLowerCase() === task.project_key.toLowerCase())) errors.push(`tasks[${i}] references an unmapped project_key.`);
    if (task.status !== "todo" && task.status !== "blocked") errors.push(`tasks[${i}] status must be todo or blocked; do not import doing/done history as active work.`);
    if (task.priority && !["critical", "high", "medium", "low"].includes(task.priority)) errors.push(`tasks[${i}] has an unsupported priority.`);
    if (task.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(task.due_date)) errors.push(`tasks[${i}] due_date must be YYYY-MM-DD or null.`);
    if (seenTaskKeys.has(task.source_key)) errors.push(`Duplicate task source_key: ${task.source_key}.`);
    seenTaskKeys.add(task.source_key);
    const target = matches.get(task.project_key) || current.find((x) => x.source_key === task.project_key || `${x.owner}/${x.repo}`.toLowerCase() === task.project_key.toLowerCase());
    const taskOwner = current.find((project) => project.task_source_keys.includes(task.source_key));
    if (taskOwner && target && taskOwner.id !== target.id) { errors.push(`Task source_key ${task.source_key} is already recorded under a different project.`); continue; }
    if (taskOwner && !target) { errors.push(`Task source_key ${task.source_key} is already recorded; resolve its project mapping before import.`); continue; }
    if (sameResolvedOwner(taskOwner, target)) { taskSkipped++; continue; }
    const rows = tasksToCreate.get(task.project_key) || [];
    rows.push(task); tasksToCreate.set(task.project_key, rows);
  }

  const seenEntryKeys = new Set<string>();
  const entriesToCreate = new Map<string, EntryInput[]>();
  let entrySkipped = 0;
  for (const [i, entry] of entries.entries()) {
    if (!nonEmpty(entry.source_key) || !nonEmpty(entry.project_key) || !nonEmpty(entry.title) || !nonEmpty(entry.body) || !validImportDate(entry.entry_date)) { errors.push(`entries[${i}] requires source_key, project_key, title, body, and a valid YYYY-MM-DD entry_date.`); continue; }
    if (entry.source_key !== entry.source_key.trim() || entry.project_key !== entry.project_key.trim()) { errors.push(`entries[${i}] source_key and project_key must be trimmed.`); continue; }
    if (!safeImportSourceUrl(entry.evidence_url)) errors.push(`entries[${i}] evidence_url must be a valid HTTPS URL without embedded credentials.`);
    if (!projectKeys.has(entry.project_key) && !current.some((x) => x.source_key === entry.project_key || `${x.owner}/${x.repo}`.toLowerCase() === entry.project_key.toLowerCase())) errors.push(`entries[${i}] references an unmapped project_key.`);
    if (entry.kind !== "note" && entry.kind !== "decision") errors.push(`entries[${i}] kind must be note or decision.`);
    if (entry.decision_status && !["proposed", "accepted", "superseded", "rejected"].includes(entry.decision_status)) errors.push(`entries[${i}] has an unsupported decision_status.`);
    if (seenEntryKeys.has(entry.source_key)) errors.push(`Duplicate entry source_key: ${entry.source_key}.`);
    seenEntryKeys.add(entry.source_key);
    const target = matches.get(entry.project_key) || current.find((x) => x.source_key === entry.project_key || `${x.owner}/${x.repo}`.toLowerCase() === entry.project_key.toLowerCase());
    const sourceUrl = importEntryIdentity(entry.source_key);
    const entryOwner = current.find((project) => project.entry_source_urls.includes(sourceUrl));
    if (entryOwner && target && entryOwner.id !== target.id) { errors.push(`Entry source_key ${entry.source_key} is already recorded under a different project.`); continue; }
    if (entryOwner && !target) { errors.push(`Entry source_key ${entry.source_key} is already recorded; resolve its project mapping before import.`); continue; }
    if (sameResolvedOwner(entryOwner, target)) { entrySkipped++; continue; }
    const rows = entriesToCreate.get(entry.project_key) || [];
    rows.push(entry); entriesToCreate.set(entry.project_key, rows);
  }

  return { manifest: { schema_version: "mythic-import-v1", projects, tasks, entries }, matches, projectsToCreate, tasksToCreate, entriesToCreate, errors, taskSkipped, entrySkipped };
}

export default function ImportClient({ projects }: { projects: ImportProjectState[] }) {
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState("");
  // Projects the last import wrote to, so the result links straight to them.
  const [touched, setTouched] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => raw.trim() ? makePlan(raw, projects) : null, [raw, projects]);

  const importNow = async () => {
    if (!plan || plan.errors.length) return;
    setBusy(true); setMessage("");
    const resolved = new Map(plan.matches);
    try {
      const wrote = new Map<string, string>();
      if (plan.projectsToCreate.length) {
        const result = await api<{ created: Array<{ id: string; name: string; source_key?: string | null; owner: string | null; repo: string | null }>; failed: Array<{ name: string; reason: string }> }>("/api/projects", "POST", { items: plan.projectsToCreate });
        if (result.failed.length) throw new Error(`Some project categories were not created: ${result.failed.map((f) => `${f.name} (${f.reason})`).join("; ")}. Reload and preview again to reconcile.`);
        for (const project of result.created) {
          const source = plan.projectsToCreate.find((p) => p.source_key === project.source_key);
          wrote.set(project.id, project.name);
          if (source) resolved.set(source.source_key, { id: project.id, name: project.name, owner: project.owner, repo: project.repo, source_key: project.source_key ?? null, status: source.status || "planned", task_source_keys: [], entry_source_urls: [] });
        }
      }
      for (const [projectKey, rows] of plan.tasksToCreate) {
        const project = resolved.get(projectKey) || projects.find((p) => p.source_key === projectKey || `${p.owner}/${p.repo}`.toLowerCase() === projectKey.toLowerCase());
        if (!project) throw new Error(`Project mapping disappeared for ${projectKey}. Reload and preview again.`);
        wrote.set(project.id, project.name);
        await api(`/api/projects/${project.id}/tasks`, "POST", { items: rows.map(({ project_key: _projectKey, ...task }) => task) });
      }
      for (const [projectKey, rows] of plan.entriesToCreate) {
        const project = resolved.get(projectKey) || projects.find((p) => p.source_key === projectKey || `${p.owner}/${p.repo}`.toLowerCase() === projectKey.toLowerCase());
        if (!project) throw new Error(`Project mapping disappeared for ${projectKey}. Reload and preview again.`);
        wrote.set(project.id, project.name);
        await api(`/api/projects/${project.id}/entries`, "POST", { items: rows.map((entry) => ({ kind: entry.kind, title: entry.title, body: entry.body, entry_date: entry.entry_date, source_url: importEntryIdentity(entry.source_key), evidence_url: entry.evidence_url ?? null, decision_status: entry.decision_status ?? (entry.kind === "decision" ? "proposed" : null) })) });
      }
      setMessage(`Import completed. Created ${plan.projectsToCreate.length} project categories, attempted ${Array.from(plan.tasksToCreate.values()).reduce((n, x) => n + x.length, 0)} new tasks, and added ${Array.from(plan.entriesToCreate.values()).reduce((n, x) => n + x.length, 0)} log entries. Existing keyed records skipped: ${plan.taskSkipped} tasks, ${plan.entrySkipped} entries. Reload this page before another import to read back current state.`);
      setTouched(Array.from(wrote, ([id, name]) => ({ id, name })));
      setRaw("");
    } catch (err) {
      setMessage(err instanceof Error ? `Import stopped: ${err.message}` : "Import stopped. Reload and inspect the private dashboard before retrying.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <section className="border border-line bg-bg-warm/50 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h2 className="serif-display text-2xl">Sanitized manifest</h2>
          <button type="button" className="mono-label text-accent hover:text-fg" onClick={() => setRaw(JSON.stringify(template, null, 2))}>Load schema example</button>
        </div>
        <p className="text-fg-ghost text-xs leading-relaxed mb-4">Use explicit project source keys or owner/repo mappings. Each task must have a stable source key and a clear project key. Do not include secrets, customer identities, account identifiers, or raw private messages.</p>
        <textarea value={raw} onChange={(e) => { setRaw(e.target.value); setMessage(""); }} spellCheck={false} aria-label="Sanitized import JSON" placeholder="Paste the reviewed mythic-import-v1 JSON manifest" className="w-full min-h-[24rem] border border-line bg-bg p-4 font-mono text-xs leading-relaxed text-fg outline-none focus:border-accent" />
      </section>

      {plan ? <section className="border border-line p-4 md:p-6">
        <div className="flex items-baseline justify-between mb-4"><h2 className="serif-display text-2xl">Preview</h2><span className="mono-label-dim">No writes until you import</span></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line mb-5">
          <Count label="Categories to create" value={plan.projectsToCreate.length} />
          <Count label="Task batches" value={plan.tasksToCreate.size} />
          <Count label="New tasks" value={Array.from(plan.tasksToCreate.values()).reduce((n, xs) => n + xs.length, 0)} />
          <Count label="Log entries" value={Array.from(plan.entriesToCreate.values()).reduce((n, xs) => n + xs.length, 0)} />
        </div>
        <p className="mono-label-dim mb-4">Existing stable-key records skipped: {plan.taskSkipped} tasks, {plan.entrySkipped} entries.</p>
        {plan.errors.length ? <div className="border border-line bg-bg-warm/70 p-4 mb-4"><div className="mono-label mb-2">Resolve before import</div><ul className="list-disc pl-5 space-y-1 text-sm text-fg-dim">{plan.errors.map((error, i) => <li key={`${i}-${error}`}>{error}</li>)}</ul></div> : null}
        <div className="space-y-2 mb-5">{plan.projectsToCreate.map((project) => <div key={project.source_key} className="text-sm text-fg-dim">New category <strong className="text-fg">{project.name}</strong> · {project.source_key}</div>)}{Array.from(plan.tasksToCreate.entries()).map(([key, tasks]) => { const target = plan.matches.get(key); return <div key={key} className="text-sm text-fg-dim">{target ? <Link href={projectHref(target.id)} className="text-fg hover:text-accent">{key}</Link> : key}: {tasks.length} new tasks</div>; })}</div>
        <div className="border-t border-line pt-4 mt-4">
          <div className="mono-label-dim mb-2">Project mappings</div>
          <div className="space-y-2">{plan.manifest.projects.map((project) => {
            const existing = plan.matches.get(project.source_key);
            return <div key={project.source_key} className="text-xs text-fg-dim"><span className="text-fg">{project.name}</span> · {project.source_key} → {existing ? <Link href={projectHref(existing.id)} className="text-fg hover:text-accent underline-offset-2 hover:underline">{existing.name} ({existing.id}) →</Link> : "create in private store"}</div>;
          })}</div>
        </div>
        <button type="button" disabled={busy || !!plan.errors.length || !(plan.projectsToCreate.length || plan.tasksToCreate.size || plan.entriesToCreate.size)} onClick={importNow} className="border border-accent px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-accent disabled:cursor-not-allowed disabled:opacity-40 hover:bg-accent/10">{busy ? "Importing…" : "Import reviewed manifest"}</button>
      </section> : null}
      {message ? <div role="status" className="border border-line bg-bg-warm/70 p-4 text-sm leading-relaxed text-fg-dim">{message}{touched.length ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{touched.map((p) => <Link key={p.id} href={projectHref(p.id)} className="font-mono text-xs text-accent hover:text-fg">{p.name} →</Link>)}</div> : null}</div> : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="bg-bg p-4"><div className="mono-label-dim">{label}</div><div className="serif-display text-2xl mt-2">{value}</div></div>;
}
