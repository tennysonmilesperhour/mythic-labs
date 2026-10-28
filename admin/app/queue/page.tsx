import Link from "next/link";
import { loadAll } from "@/lib/projects";
import type { ProjectDetail, Task } from "@/lib/projectTypes";

export const dynamic = "force-dynamic";

type Lane = "Needs investigation" | "In progress / verify" | "Blocked" | "Planned" | "Paused" | "Completed";

function laneFor(project: ProjectDetail, task: Task): Lane {
  if (project.project.status === "paused") return "Paused";
  if (task.status === "done") return "Completed";
  if (task.status === "blocked") return "Blocked";
  if (project.project.status === "planned") return "Planned";
  if (task.status === "doing") return "In progress / verify";
  return "Needs investigation";
}

const laneNotes: Record<Lane, string> = {
  "Needs investigation": "Needs current evidence and a specific action proposal. No execution permission is inferred from the task record.",
  "In progress / verify": "Existing work is recorded as in progress; verify its current state before proposing another action.",
  Blocked: "A blocker is recorded. Resolve the stated dependency before considering an action.",
  Planned: "The project is planned and has not been marked workable. Owner direction is needed before work starts.",
  Paused: "The project is explicitly paused. It is excluded from investigation and execution.",
  Completed: "Completed history is shown for context and is excluded from active work.",
};

/** Anchor for a lane, so other pages can link straight to it (e.g. /queue#blocked). */
function laneId(lane: Lane): string {
  return lane.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

const lanes: Lane[] = ["Needs investigation", "In progress / verify", "Blocked", "Planned", "Paused", "Completed"];

function TaskCard({ project, task }: { project: ProjectDetail; task: Task }) {
  const lane = laneFor(project, task);
  return (
    <article className="border border-line bg-bg-warm/50 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <Link className="mono-label text-accent hover:text-fg" href={`/projects/${project.project.id}`}>
          {project.project.name}
        </Link>
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-fg-ghost">
          {task.priority} · {task.status}
        </span>
      </div>
      <h3 className="text-fg text-sm font-medium leading-snug">{task.title}</h3>
      {task.notes ? <p className="text-fg-dim text-sm leading-relaxed mt-2 whitespace-pre-wrap">{task.notes}</p> : null}
      {task.due_date ? <p className="mono-label-dim mt-3">Due {task.due_date}</p> : null}
      <p className="text-fg-ghost text-xs leading-relaxed mt-3">{laneNotes[lane]}</p>
    </article>
  );
}

export default async function QueuePage() {
  let projects: ProjectDetail[] = [];
  let error: string | null = null;
  try {
    projects = await loadAll();
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to read the private project store.";
  }

  const rows = projects.flatMap((project) => project.tasks.map((task) => ({ project, task })));
  const activeCount = rows.filter(({ project, task }) => project.project.status !== "paused" && task.status !== "done").length;

  return (
    <div>
      <div className="hairline-accent mb-6"><span className="mono-label">02 · Automation queue</span></div>
      <h1 className="serif-display text-[2.2rem] md:text-[3rem] leading-[1] mb-4">Review before anything runs</h1>
      <p className="text-fg-dim text-sm leading-relaxed max-w-3xl mb-8">
        This is a read-only queue preview. Task status and safety assessments do not grant authority. There are no run or approval controls here until the dashboard can verify owner approval for an exact, unchanged action.
      </p>

      {error ? (
        <div className="border border-line bg-bg-warm/80 p-6 glow-anchor">
          <div className="mono-label mb-2">Queue unavailable</div>
          <p className="text-fg-dim text-sm leading-relaxed">{error}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line mb-10">
            <div className="bg-bg p-4"><div className="mono-label-dim">Recorded tasks</div><div className="serif-display text-2xl mt-2">{rows.length}</div></div>
            <div className="bg-bg p-4"><div className="mono-label-dim">Open, not paused</div><div className="serif-display text-2xl mt-2">{activeCount}</div></div>
            <div className="bg-bg p-4"><div className="mono-label-dim">Runnable now</div><div className="serif-display text-2xl mt-2">0</div></div>
            <div className="bg-bg p-4"><div className="mono-label-dim">Approval controls</div><div className="font-mono text-sm mt-3 text-fg-dim">Not enabled</div></div>
          </div>

          {lanes.map((lane) => {
            const items = rows.filter(({ project, task }) => laneFor(project, task) === lane);
            return (
              <section key={lane} id={laneId(lane)} className="mb-10 scroll-mt-20">
                <div className="flex items-baseline justify-between border-b border-line pb-3 mb-4">
                  <h2 className="serif-display text-2xl">{lane}</h2>
                  <span className="mono-label-dim">{items.length} items</span>
                </div>
                {items.length ? (
                  <div className="grid md:grid-cols-2 gap-3">{items.map(({ project, task }) => <TaskCard key={task.id} project={project} task={task} />)}</div>
                ) : <p className="text-fg-ghost text-sm">No items in this lane.</p>}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
