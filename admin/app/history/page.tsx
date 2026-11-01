import Link from "next/link";
import { getHistory, historyAvailable, loadAll } from "@/lib/projects";
import { sortProjects } from "@/lib/projectTypes";
import { fixHref } from "@/lib/taskMap";
import HistoryClient, { type Commit } from "./HistoryClient";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  let error: string | null = null;
  let commits: Commit[] = [];
  let available = false;
  let projects: Array<{ id: string; name: string }> = [];
  try {
    const all = await loadAll();
    projects = sortProjects(all.map((d) => d.project)).map((p) => ({ id: p.id, name: p.name }));
    available = historyAvailable();
    if (available) commits = await getHistory(project && projects.some((p) => p.id === project) ? project : undefined, 60);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div>
      <header className="border-b border-line pb-6 mb-10">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">History</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Every change to the plan is a commit in the private data repository, so nothing is ever lost. Filter to one project to see its versions, preview any of them, and restore it. A restore is itself a new commit; nothing is rewritten.
        </p>
      </header>
      {error ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : !available ? (
        <p className="border border-dashed border-line px-4 py-6 text-sm text-fg-dim">
          History needs the GitHub-backed store. With PM_DATA_DIR (local files) there is no commit log to show.
        </p>
      ) : (
        <HistoryClient commits={commits} projects={projects} projectId={project && projects.some((p) => p.id === project) ? project : ""} />
      )}
    </div>
  );
}
