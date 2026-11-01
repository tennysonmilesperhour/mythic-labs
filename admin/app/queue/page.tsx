import Link from "next/link";
import { loadAll } from "@/lib/projects";
import { AGENT_PRESETS, isReady, sortProjects, taskPath, waitingOn } from "@/lib/projectTypes";
import { fixHref, isMine } from "@/lib/taskMap";
import QueueClient, { type QueueProject, type Row } from "./QueueClient";

export const dynamic = "force-dynamic";

export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  let error: string | null = null;
  let rows: Row[] = [];
  let projects: QueueProject[] = [];
  let agents: string[] = [];
  let labels: string[] = [];
  try {
    const all = await loadAll();
    projects = sortProjects(all.map((d) => d.project)).map((p) => {
      const d = all.find((x) => x.project.id === p.id)!;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        agents: p.agents,
        milestones: d.milestones.sort((a, b) => a.sort_order - b.sort_order).map((m) => ({ id: m.id, title: m.title, done: m.done })),
      };
    });
    rows = all.flatMap((d) =>
      d.tasks.map((t) => {
        const kids = d.tasks.filter((x) => x.parent_id === t.id);
        return {
          ...t,
          project_name: d.project.name,
          project_status: d.project.status,
          milestone_title: d.milestones.find((m) => m.id === t.milestone_id)?.title ?? null,
          path: taskPath(t, d.tasks),
          ready: isReady(t, d.tasks),
          waiting: waitingOn(t, d.tasks).map((x) => x.title),
          subtasks: kids.length,
          subtasks_done: kids.filter((x) => x.status === "done").length,
          mine: isMine(t),
          thread: d.entries.filter((e) => e.task_id === t.id).length,
        };
      })
    );
    agents = Array.from(new Set([...AGENT_PRESETS, ...all.flatMap((d) => d.project.agents), ...rows.map((r) => r.agent).filter((a): a is string => !!a)]));
    labels = Array.from(new Set(rows.flatMap((r) => r.labels))).sort();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div>
      <header className="border-b border-line pb-6 mb-8">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">All tasks</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Every task across every project, filtered, grouped and edited in place. Select several and change them in one commit. Keys: j k move, x select, ↵ open, d done, s start, b blocked, t today, e edit, p details.
        </p>
      </header>
      {error ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : (
        <QueueClient rows={rows} projects={projects} agents={agents} labels={labels} initial={params} />
      )}
    </div>
  );
}
