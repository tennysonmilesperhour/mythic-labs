import Link from "next/link";
import { getHub, loadAll } from "@/lib/projects";
import { dueLabel, isOverdue, isReady, waitingOn, type Task } from "@/lib/projectTypes";
import { ME, attentionHref, fixHref, isMine, taskHref } from "@/lib/taskMap";

export const dynamic = "force-dynamic";

type Row = Task & { project_name: string; note: string };

export default async function MyTasksPage() {
  let error: string | null = null;
  let all: Awaited<ReturnType<typeof loadAll>> = [];
  let hub: Awaited<ReturnType<typeof getHub>> | null = null;
  try {
    [all, hub] = await Promise.all([loadAll(), getHub()]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const live = all.filter((d) => d.project.status !== "paused");
  const rows = (pick: (t: Task, ts: Task[]) => boolean, note: (t: Task, ts: Task[]) => string): Row[] =>
    live.flatMap((d) =>
      d.tasks.filter((t) => pick(t, d.tasks)).map((t) => ({ ...t, project_name: d.project.name, note: note(t, d.tasks) }))
    );
  const open = (t: Task) => t.status !== "done";
  const due = (t: Task) => (t.due_date ? ` · ${dueLabel(t.due_date)}` : "");

  const doing = rows((t) => isMine(t) && t.status === "doing", (t) => `in progress${due(t)}`);
  const ready = rows((t, ts) => isMine(t) && isReady(t, ts), (t) => `ready${due(t)}`).sort(
    (a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
  );
  const waiting = rows(
    (t, ts) => isMine(t) && open(t) && t.status !== "doing" && !isReady(t, ts),
    (t, ts) => (t.status === "blocked" ? "blocked" : `after ${waitingOn(t, ts).map((w) => w.title).join(", ") || "subtasks"}`)
  );
  const blockedOthers = rows((t) => !isMine(t) && t.status === "blocked", (t) => (t.agent ? `@${t.agent} is stuck` : "blocked, unassigned"));
  const unowned = rows((t) => open(t) && !t.agent && (t.priority === "critical" || isOverdue(t.due_date, false)), (t) => `${t.priority}${due(t)}, nobody assigned`);
  const calls = (hub?.attention ?? []).filter((a) => !a.task_id);

  return (
    <div className="flex flex-col gap-12">
      <header className="border-b border-line pb-6">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">My tasks</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Everything only you can do: tasks assigned to @{ME}, decisions waiting on your call, and agents stuck on a
          blocker. Each row opens a task map with the steps, links and text to paste.
        </p>
      </header>

      {error ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : (
        <>
          <Group title="In progress" rows={doing} empty="Nothing you've started." />
          <Group title="Ready for you" rows={ready} empty={`No ready task is assigned to @${ME}. Assign one from any project's plan, or on its task map.`} />
          <section>
            <Head title="Your calls" count={calls.length} />
            <p className="text-fg-ghost text-[0.78rem] mb-3">Project decisions and fixes nobody else can make.</p>
            {calls.length ? (
              <ul className="border border-line divide-y divide-[rgba(26,24,20,0.06)] bg-bg/85">
                {calls.map((a) => (
                  <li key={a.key}>
                    <Link href={attentionHref(a)} className="flex items-baseline gap-3 px-4 py-2.5 hover:bg-[rgba(139,115,85,0.05)]">
                      <span className="flex-1 min-w-0">
                        <span className="text-[0.88rem] text-fg">{a.title}</span>
                        <span className="block font-mono text-[0.58rem] text-fg-ghost truncate">
                          {a.project_name ? `${a.project_name} · ` : ""}{a.detail}
                        </span>
                      </span>
                      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-accent shrink-0">Open map →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-ghost text-sm">Nothing waiting on a decision.</p>
            )}
          </section>
          <Group title="Agents blocked, waiting on you" rows={blockedOthers} empty="No agent is blocked." />
          <Group title="Urgent and unowned" rows={unowned} empty="Every critical or overdue task has an owner." />
          <Group title="Yours, waiting on something" rows={waiting} empty="Nothing of yours is waiting." />
        </>
      )}
    </div>
  );
}

function Head({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="text-[1.05rem] font-medium text-fg mb-1">
      {title}
      <span className="ml-2 font-mono text-[0.75rem] text-fg-ghost tnum">{count}</span>
    </h2>
  );
}

function Group({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section>
      <Head title={title} count={rows.length} />
      {rows.length ? (
        <ul className="mt-3 border border-line divide-y divide-[rgba(26,24,20,0.06)] bg-bg/85">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={taskHref(t.id, t.status === "blocked" ? "blocked" : undefined)} className="flex items-baseline gap-3 px-4 py-2.5 hover:bg-[rgba(139,115,85,0.05)]">
                <span className="flex-1 min-w-0">
                  <span className="text-[0.88rem] text-fg">{t.title}</span>
                  <span className="block font-mono text-[0.58rem] text-fg-ghost truncate">{t.project_name} · {t.note}</span>
                </span>
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-accent shrink-0">Open map →</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-ghost text-sm mt-2">{empty}</p>
      )}
    </section>
  );
}
