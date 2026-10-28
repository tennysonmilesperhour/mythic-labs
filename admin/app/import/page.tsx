import { loadAll } from "@/lib/projects";
import ImportClient, { type ImportProjectState } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  let projects: ImportProjectState[] = [];
  let error: string | null = null;
  try {
    projects = (await loadAll()).map(({ project, tasks, entries }) => ({
      id: project.id,
      name: project.name,
      owner: project.owner,
      repo: project.repo,
      source_key: project.source_key ?? null,
      status: project.status,
      task_source_keys: tasks.map((task) => task.source_key).filter((key): key is string => !!key),
      entry_source_urls: entries.map((entry) => entry.source_url).filter((key): key is string => !!key),
    }));
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to read the private project store.";
  }

  return (
    <div>
      <div className="hairline-accent mb-6"><span className="mono-label">03 · Private import</span></div>
      <h1 className="serif-display text-[2.2rem] md:text-[3rem] leading-[1] mb-4">Bring in reviewed work</h1>
      <p className="text-fg-dim text-sm leading-relaxed max-w-3xl mb-8">
        Paste a normalized, sanitized manifest. This page previews explicit project mappings and stable source keys before writing to the private dashboard store. It creates missing categories and tasks, adds deduplicated decision/report entries, and never executes tasks.
      </p>
      {error ? (
        <div className="border border-line bg-bg-warm/80 p-6"><div className="mono-label mb-2">Import unavailable</div><p className="text-fg-dim text-sm">{error}</p></div>
      ) : <ImportClient projects={projects} />}
    </div>
  );
}
