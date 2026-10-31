"use client";

import Link from "next/link";
import { useState } from "react";
import {
  daysSince,
  dueLabel,
  fmtDate,
  isReady,
  rankReady,
  today,
  waitingOn,
  type Entry,
  type Milestone,
  type Project,
  type ProjectDetail,
  type Task,
} from "@/lib/projectTypes";
import { ME, facetHref, projectHref, repoLinks, taskHref, toolLinks } from "@/lib/taskMap";
import SubLink from "@/components/SubLink";
import { api, btnGhost, btnPrimary, inputCls } from "@/components/ProjectBits";
import CopyBlock from "@/components/CopyBlock";
import { INSTRUCTIONS_TEMPLATE } from "../projects/[id]/ProjectDetailClient";

/** One attention flag on one project, with the fix inline and everything needed to make it. */
export default function FixClient({
  initial,
  kind,
  refId,
  title,
  detail,
}: {
  initial: ProjectDetail;
  kind: string;
  refId: string | null;
  title: string | null;
  detail: string | null;
}) {
  const [project, setProject] = useState(initial.project);
  const [milestones, setMilestones] = useState(initial.milestones);
  const [entries, setEntries] = useState(initial.entries);
  const tasks = initial.tasks;
  const [error, setError] = useState<string | null>(null);
  const [fixed, setFixed] = useState(false);
  const [saving, setSaving] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      setFixed(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const patchProject = (patch: Partial<Project> & { status_note?: string }) =>
    run(async () => {
      const res = await api<{ project: Project }>(`/api/projects/${project.id}`, "PATCH", patch);
      setProject(res.project);
    });
  const patchMilestone = (id: string, patch: Partial<Milestone>) =>
    run(async () => {
      const res = await api<{ milestone: Milestone }>(`/api/milestones/${id}`, "PATCH", patch);
      setMilestones((ms) => ms.map((m) => (m.id === id ? res.milestone : m)));
    });
  const patchEntry = (id: string, patch: Partial<Entry>) =>
    run(async () => {
      const res = await api<{ entry: Entry }>(`/api/entries/${id}`, "PATCH", patch);
      setEntries((es) => es.map((e) => (e.id === id ? res.entry : e)));
    });
  const addNote = (titleText: string, body = "") =>
    run(async () => {
      await api(`/api/projects/${project.id}/entries`, "POST", { kind: "note", title: titleText, body, entry_date: today() });
    });

  const ready = rankReady(tasks, milestones);
  const open = tasks.filter((t) => t.status !== "done");
  const planHref = `/projects/${project.id}?tab=plan`;
  const setupHref = `/projects/${project.id}?tab=setup`;
  const links = [...project.links, ...repoLinks(project), ...toolLinks(project.tools, project)];

  const body = (() => {
    switch (kind) {
      case "decision": {
        const e = entries.find((x) => x.id === refId);
        if (!e) return <Gone what="decision" href={`/projects/${project.id}?tab=decisions`} />;
        return (
          <Decision
            e={e}
            saving={saving}
            onDecide={(decision_status, body) => patchEntry(e.id, { decision_status, ...(body !== undefined ? { body } : {}) })}
            projectHref={`/projects/${project.id}?tab=decisions&entry=${e.id}`}
          />
        );
      }
      case "next":
        return (
          <NextAction
            current={project.next_action}
            suggestions={[...ready.slice(0, 4).map((t) => t.title), ...open.filter((t) => t.status === "doing").map((t) => `Finish ${t.title}`)]}
            saving={saving}
            onSave={(next_action) => patchProject({ next_action })}
          />
        );
      case "instructions":
        return <Instructions project={project} saving={saving} onSave={(agent_instructions) => patchProject({ agent_instructions })} />;
      case "stale":
      case "paused":
        return (
          <StillGoing
            project={project}
            saving={saving}
            paused={kind === "paused"}
            onStatus={(status, note) => patchProject({ status, status_note: note })}
            onNote={(n) => addNote("Still active", n)}
            ready={ready}
          />
        );
      case "empty":
        return (
          <Steps
            steps={[
              { text: "Add the next milestone and its tasks on the plan.", href: planHref, cta: "Open plan" },
              { text: "Or ask an agent to draft them. Paste this into a session that can see the repo:", copy: `Read ${project.owner && project.repo ? `${project.owner}/${project.repo}` : project.name} and propose the next milestone for "${project.name}": 3 to 8 tasks, each with a one-line done-when. Summary: ${project.summary || "(none)"}. Don't start any work.` },
              { text: "If there's nothing left to do, change the status instead.", buttons: [
                { label: "Pause project", onClick: () => patchProject({ status: "paused", status_note: "No open tasks" }) },
                { label: "Move to planned", onClick: () => patchProject({ status: "planned" }) },
              ] },
            ]}
            saving={saving}
          />
        );
      case "stuck":
        return (
          <div>
            <p className="text-fg-dim text-sm mb-4">Every open task is waiting on something. Clear the first one and work flows again.</p>
            <TaskList tasks={open} all={tasks} />
          </div>
        );
      case "target":
        return (
          <DateFix
            label="Project target"
            labelHref={projectHref(project.id)}
            current={project.target_date}
            saving={saving}
            onSave={(target_date) => patchProject({ target_date })}
            extra={<TaskList tasks={open} all={tasks} title="What's still open" />}
          />
        );
      case "ms": {
        const m = milestones.find((x) => x.id === refId);
        if (!m) return <Gone what="milestone" href={planHref} />;
        const mt = tasks.filter((t) => t.milestone_id === m.id);
        return (
          <DateFix
            label={`Milestone: ${m.title}`}
            labelHref={planHref}
            current={m.target_date}
            saving={saving}
            onSave={(target_date) => patchMilestone(m.id, { target_date })}
            done={{ label: "Mark milestone done", onClick: () => patchMilestone(m.id, { done: true }) }}
            extra={<TaskList tasks={mt.filter((t) => t.status !== "done")} all={tasks} title={`Open in this milestone (${mt.filter((t) => t.status === "done").length}/${mt.length} done)`} />}
          />
        );
      }
      default:
        return (
          <p className="text-fg-dim text-sm">
            Open the <Link href={`/projects/${project.id}`} className="text-accent underline">project</Link> to handle this.
          </p>
        );
    }
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-12">
      <div className="min-w-0">
        <Link href={`/projects/${project.id}`} className="mono-label text-accent hover:text-fg">{project.name}</Link>
        <h1 className="serif-display text-[2.2rem] md:text-[2.8rem] leading-[1.05] mt-2 mb-2">{title ?? "Already handled"}</h1>
        <p className="font-mono text-[0.62rem] text-fg-ghost mb-6">{detail ?? "This flag is no longer raised. Nothing to do."}</p>
        <p className="text-fg-dim text-[0.92rem] leading-relaxed mb-8 max-w-2xl">{WHY[kind] ?? ""}</p>
        {fixed ? (
          <div className="border border-accent bg-[rgba(139,115,85,0.06)] px-5 py-3 mb-8 glow-anchor flex flex-wrap items-baseline gap-4">
            <span className="mono-label">Saved</span>
            <Link href="/tasks" className="text-fg hover:text-accent text-[0.92rem]">Next thing that needs you →</Link>
            <Link href={`/projects/${project.id}`} className="text-fg-dim hover:text-accent text-[0.85rem]">Back to {project.name}</Link>
          </div>
        ) : null}
        {error ? (
          <div className="mb-6 font-mono text-xs text-accent flex justify-between border border-line px-4 py-2 bg-bg-warm/80">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-fg-ghost hover:text-fg">dismiss</button>
          </div>
        ) : null}
        {body}
      </div>
      <aside className="flex flex-col gap-8">
        <section>
          <div className="hairline-accent-sm mb-3"><span className="mono-label">Project</span></div>
          <dl className="flex flex-col gap-2 text-[0.82rem] text-fg-dim">
            <div>
              Status:{" "}
              <Link href={`/projects?view=list&status=${project.status}`} className="text-fg hover:text-accent">{project.status}</Link>
              {" · "}
              {project.priority}
            </div>
            {project.next_action ? <div>Next action: <span className="text-fg">{project.next_action}</span></div> : null}
            {project.summary ? <div>{project.summary}</div> : null}
            <div>
              <Link href={planHref} className="hover:text-accent">{open.length} open tasks · {ready.length} ready</Link>
            </div>
          </dl>
          <div className="flex flex-col mt-3">
            <Link href={planHref} className="py-1 text-[0.85rem] text-fg hover:text-accent">Plan →</Link>
            <Link href={`/projects/${project.id}?tab=decisions`} className="py-1 text-[0.85rem] text-fg hover:text-accent">Decisions →</Link>
            <Link href={setupHref} className="py-1 text-[0.85rem] text-fg hover:text-accent">Setup →</Link>
          </div>
        </section>
        {links.length ? (
          <section>
            <div className="hairline-accent-sm mb-3"><span className="mono-label">Links</span></div>
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.url + l.label}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="block py-1 text-[0.85rem] text-fg hover:text-accent truncate">{l.label} ↗</a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

const WHY: Record<string, string> = {
  decision: "An agent proposed this and is waiting for your call. Accepting makes it a rule every agent brief includes; rejecting tells them not to go that way.",
  next: "The next action is the one line you and every agent read first. Without it, work drifts.",
  instructions: "Agents are assigned but have no build instructions: setup, branch rules, checks, definition of done. They'll guess or stop to ask.",
  stale: "Nothing has changed on this project in a while. Either it's still going (log a note and set a next step) or it should be paused so it stops showing up.",
  paused: "Paused for a long time. Revive it, or leave it paused and this reminder goes quiet for another 60 days once you log a note.",
  empty: "The project is active but has no open tasks, so nobody, human or agent, has anything to pick up.",
  stuck: "There are open tasks, but none can start: each is blocked or waiting on another.",
  target: "The project's target date has passed. Set a realistic date, or finish what's left.",
  ms: "This milestone's target date has passed. Move the date, close the milestone, or push its remaining tasks forward.",
};

function Gone({ what, href }: { what: string; href: string }) {
  return (
    <p className="text-fg-dim text-sm">
      That {what} no longer exists. <Link href={href} className="text-accent underline">Open the project</Link>.
    </p>
  );
}

function Decision({
  e,
  saving,
  onDecide,
  projectHref,
}: {
  e: Entry;
  saving: boolean;
  onDecide: (s: "accepted" | "rejected", body?: string) => void;
  projectHref: string;
}) {
  const [body, setBody] = useState(e.body);
  const fields: Array<[string, string]> = [
    ["Context", e.context],
    ["Alternatives", e.alternatives],
    ["Consequences", e.consequences],
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="font-mono text-[0.6rem] text-fg-ghost">
        {e.author ? (
          <>
            Proposed by{" "}
            {e.author === ME ? `@${e.author}` : <Link href={facetHref("agent", e.author)} className="hover:text-accent">@{e.author}</Link>}
            {" · "}
          </>
        ) : null}{fmtDate(e.entry_date)} · status <span className="text-fg">{e.decision_status}</span>
        {e.source_url ? <a href={e.source_url} target="_blank" rel="noreferrer" className="ml-3 text-accent">source ↗</a> : null}
      </div>
      {fields.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}>
          <div className="mono-label-dim mb-1">{k}</div>
          <p className="text-[0.92rem] text-fg leading-relaxed whitespace-pre-wrap">{v}</p>
        </div>
      ))}
      <div>
        <div className="mono-label mb-1">The decision (edit before accepting if needed)</div>
        <textarea value={body} onChange={(x) => setBody(x.target.value)} rows={4} className={inputCls} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={saving || e.decision_status === "accepted"} onClick={() => onDecide("accepted", body !== e.body ? body : undefined)}>Accept</button>
        <button className={btnGhost} disabled={saving || e.decision_status === "rejected"} onClick={() => onDecide("rejected")}>Reject</button>
        <Link href={projectHref} className={btnGhost}>See all decisions</Link>
      </div>
      <div>
        <div className="font-mono text-[0.58rem] text-fg-ghost mb-1">Need more before deciding? Paste this back to the agent:</div>
        <CopyBlock text={`Before I decide on "${e.title}": what breaks if we don't do this, what does each alternative cost, and is it reversible? Keep it under 10 lines.`} />
      </div>
    </div>
  );
}

function NextAction({ current, suggestions, saving, onSave }: { current: string; suggestions: string[]; saving: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(current);
  return (
    <div className="flex flex-col gap-4">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="The very next thing to do" className={inputCls} />
      {suggestions.length ? (
        <div>
          <div className="font-mono text-[0.58rem] text-fg-ghost mb-2">From the plan, click to use:</div>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set(suggestions)).map((s) => (
              <button key={s} onClick={() => setV(s)} className={btnGhost}>{s}</button>
            ))}
          </div>
        </div>
      ) : null}
      <div><button className={btnPrimary} disabled={saving || !v.trim()} onClick={() => onSave(v.trim())}>Save next action</button></div>
    </div>
  );
}

function Instructions({ project, saving, onSave }: { project: Project; saving: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(project.agent_instructions || INSTRUCTIONS_TEMPLATE);
  return (
    <div className="flex flex-col gap-3">
      <div className="font-mono text-[0.6rem] text-fg-ghost">
        Agents on this project:{" "}
        {project.agents.map((a, i) => (
          <span key={a}>
            {i ? ", " : ""}
            {a === ME ? `@${a}` : <Link href={facetHref("agent", a)} className="hover:text-accent">@{a}</Link>}
          </span>
        ))}
      </div>
      <p className="text-fg-dim text-sm">Started from the template. Edit the commands and rules to match the repo, then save.</p>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={9} className={`${inputCls} leading-relaxed`} />
      {project.owner && project.repo ? (
        <p className="font-mono text-[0.6rem] text-fg-ghost">
          Check the real commands in{" "}
          <a href={`https://github.com/${project.owner}/${project.repo}/blob/HEAD/package.json`} target="_blank" rel="noreferrer" className="text-accent">package.json ↗</a>{" "}
          or the{" "}
          <a href={`https://github.com/${project.owner}/${project.repo}#readme`} target="_blank" rel="noreferrer" className="text-accent">README ↗</a>
        </p>
      ) : null}
      <div><button className={btnPrimary} disabled={saving || !v.trim()} onClick={() => onSave(v.trim())}>Save instructions</button></div>
    </div>
  );
}

function StillGoing({
  project,
  saving,
  paused,
  onStatus,
  onNote,
  ready,
}: {
  project: Project;
  saving: boolean;
  paused: boolean;
  onStatus: (s: Project["status"], note: string) => void;
  onNote: (n: string) => void;
  ready: Task[];
}) {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <div className="font-mono text-[0.6rem] text-fg-ghost">
        {project.status} since {fmtDate(project.status_changed_at)} ({daysSince(project.status_changed_at)}d)
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} placeholder="Optional: one line on where it stands" />
      <div className="flex flex-wrap gap-2">
        {paused ? (
          <button className={btnPrimary} disabled={saving} onClick={() => onStatus("active", note)}>Revive (set active)</button>
        ) : (
          <>
            <button className={btnPrimary} disabled={saving} onClick={() => onNote(note || "Still going")}>Still going, log it</button>
            <button className={btnGhost} disabled={saving} onClick={() => onStatus("paused", note)}>Pause it</button>
          </>
        )}
        {paused ? <button className={btnGhost} disabled={saving} onClick={() => onNote(note || "Leaving paused")}>Leave paused, log it</button> : null}
      </div>
      {ready.length ? (
        <div className="mt-2">
          <div className="mono-label-dim mb-1">Ready to pick up</div>
          <TaskList tasks={ready.slice(0, 5)} all={ready} />
        </div>
      ) : null}
    </div>
  );
}

function DateFix({
  label,
  labelHref,
  current,
  saving,
  onSave,
  done,
  extra,
}: {
  label: string;
  /** Where the thing being re-dated lives. */
  labelHref: string;
  current: string | null;
  saving: boolean;
  onSave: (d: string | null) => void;
  done?: { label: string; onClick: () => void };
  extra?: React.ReactNode;
}) {
  const [v, setV] = useState(current ?? "");
  return (
    <div className="flex flex-col gap-4">
      <div className="mono-label-dim">
        <Link href={labelHref} className="hover:text-accent">{label}</Link>: was {fmtDate(current)} ({dueLabel(current)})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={v} onChange={(e) => setV(e.target.value)} className="bg-transparent font-mono text-xs text-fg border border-line px-3 py-2" />
        <button className={btnPrimary} disabled={saving || !v || v === current} onClick={() => onSave(v)}>Move date</button>
        {done ? <button className={btnGhost} disabled={saving} onClick={done.onClick}>{done.label}</button> : null}
        <button className={btnGhost} disabled={saving} onClick={() => onSave(null)}>Clear date</button>
      </div>
      {extra}
    </div>
  );
}

type StepDef = {
  text: string;
  href?: string;
  cta?: string;
  copy?: string;
  buttons?: Array<{ label: string; onClick: () => void }>;
};

function Steps({ steps, saving }: { steps: StepDef[]; saving: boolean }) {
  return (
    <ol className="flex flex-col gap-6">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-4">
          <span className="font-mono text-[0.7rem] text-accent w-5 shrink-0 pt-0.5">{i + 1}</span>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <p className="text-[0.92rem] text-fg">{s.text}</p>
            {s.href ? <Link href={s.href} className={`${btnGhost} self-start`}>{s.cta ?? "Open"} →</Link> : null}
            {s.copy ? <CopyBlock text={s.copy} /> : null}
            {s.buttons ? (
              <div className="flex flex-wrap gap-2">
                {s.buttons.map((b) => <button key={b.label} className={btnGhost} disabled={saving} onClick={b.onClick}>{b.label}</button>)}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TaskList({ tasks, all, title }: { tasks: Task[]; all: Task[]; title?: string }) {
  if (!tasks.length) return <p className="text-fg-ghost text-sm">No open tasks.</p>;
  return (
    <div>
      {title ? <div className="mono-label-dim mb-1">{title}</div> : null}
      <ul className="flex flex-col">
        {tasks.map((t) => {
          const w = t.status === "todo" ? waitingOn(t, all) : [];
          const why = t.status === "blocked" ? "blocked" : w.length ? `after ${w.map((x) => x.title).join(", ")}` : isReady(t, all) ? "ready" : t.status;
          return (
            <li key={t.id}>
              <Link href={taskHref(t.id, t.status === "blocked" ? "blocked" : undefined)} className="flex items-baseline gap-3 py-1.5 border-b border-line hover:text-accent">
                <span className="flex-1 min-w-0 truncate text-[0.88rem]">{t.title}</span>
                <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0 max-w-[14rem] truncate">{t.agent && t.agent !== ME ? (
                    <>
                      <SubLink href={facetHref("agent", t.agent)}>@{t.agent}</SubLink>
                      {" · "}
                    </>
                  ) : t.agent ? `@${t.agent} · ` : ""}
                  {why}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
