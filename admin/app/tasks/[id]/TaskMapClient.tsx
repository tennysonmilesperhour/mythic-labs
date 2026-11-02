"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ESTIMATES,
  LABEL_PRESETS,
  RECURRENCES,
  RECURRENCE_META,
  addDays,
  dueLabel,
  fmtDate,
  isOverdue,
  isReady,
  isSnoozed,
  relTime,
  daysSince,
  taskPath,
  today,
  waitingOn,
  type Entry,
  type ProjectDetail,
  type Task,
  type TaskStatus,
} from "@/lib/projectTypes";
import { EditableMarkdown } from "@/components/Markdown";
import Markdown from "@/components/Markdown";
import { useToast } from "@/components/Toast";
import {
  ME,
  extractSnippets,
  extractSteps,
  extractUrls,
  facetHref,
  isMine,
  projectHref,
  labelFor,
  repoFileLinks,
  repoLinks,
  secretLinks,
  secretNames,
  serviceLinks,
  slug,
  taskHref,
  toolLinks,
  type MapLink,
} from "@/lib/taskMap";
import { Chip, InlineText, PRIORITY_MARK, TagInput, api, btnGhost, btnPrimary, inputBase, inputCls } from "@/components/ProjectBits";
import CopyBlock from "@/components/CopyBlock";
import SubLink from "@/components/SubLink";
import { GlyphArrow } from "@/components/Glyphs";

type Mine = Task & { project_name: string };

const WHY: Record<string, (t: Task) => string> = {
  blocked: () => "This task is blocked. Read the blocker in the notes, clear it, then set the task back to Todo or Start it.",
  overdue: (t) => `This was due ${fmtDate(t.due_date)} (${dueLabel(t.due_date)}). Finish it now, or move the due date to something real.`,
  stalled: (t) => `Marked in progress with no update in ${daysSince(t.updated_at)} days. Check where it stands, then mark it Done or Blocked.`,
  critical: () => "Critical priority. It stays at the top of every list until it's done.",
};

export default function TaskMapClient({
  initial,
  taskId,
  why,
  mine,
  workable,
}: {
  initial: ProjectDetail;
  taskId: string;
  why: string | null;
  mine: Mine[];
  workable: boolean;
}) {
  const { project, milestones } = initial;
  const { toast } = useToast();
  const [tasks, setTasks] = useState(initial.tasks);
  const [entries, setEntries] = useState(initial.entries);
  const [error, setError] = useState<string | null>(null);
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  const task = tasks.find((t) => t.id === taskId)!;
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const day = today();

  const patch = async (id: string, p: Partial<Task>) => {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
    setSaving(true);
    try {
      const res = await api<{ task: Task; spawned: Task | null }>(`/api/tasks/${id}`, "PATCH", p);
      setTasks((ts) => [...ts.map((t) => (t.id === id ? res.task : t)), ...(res.spawned ? [res.spawned] : [])]);
      if (res.spawned) toast({ message: `Next occurrence added, due ${fmtDate(res.spawned.due_date)}.`, tone: "success" });
    } catch (e) {
      setTasks(prev);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async (unblock = false) => {
    if (!reply.trim()) return;
    setSaving(true);
    try {
      // The reply and the unblock are one request and one commit, so neither can land without the other.
      const res = await api<{ entry: Entry; task: Task; spawned: Task | null }>(`/api/tasks/${task.id}/comments`, "POST", {
        body: reply.trim(),
        ...(unblock ? { status: "todo" } : {}),
      });
      setEntries((es) => [res.entry, ...es]);
      setTasks((ts) => ts.map((x) => (x.id === task.id ? res.task : x)));
      setReply("");
      toast({ message: unblock ? "Replied and unblocked." : "Reply posted to the thread.", tone: "success" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const chain: Task[] = [];
  for (let p = task.parent_id ? byId.get(task.parent_id) : undefined; p; p = p.parent_id ? byId.get(p.parent_id) : undefined)
    chain.unshift(p);
  const subtasks = tasks.filter((t) => t.parent_id === task.id).sort((a, b) => a.sort_order - b.sort_order);
  const deps = task.depends_on.map((id) => byId.get(id)).filter((t): t is Task => !!t);
  const waiting = waitingOn(task, tasks);
  const unblocks = tasks.filter((t) => t.depends_on.includes(task.id));
  const milestone = milestones.find((m) => m.id === task.milestone_id);
  const done = task.status === "done";
  const late = isOverdue(task.due_date, done);
  const ready = isReady(task, tasks);
  const humanOnly = isMine(task);
  const agents = project.agents.filter((a) => a !== ME);

  const steps = extractSteps(task.notes);
  const snippets = extractSnippets(task.notes, task.acceptance);
  const text = [task.title, task.notes, task.acceptance];
  const found = extractUrls(task.notes, task.acceptance);
  const files = repoFileLinks(project, task.notes, task.acceptance);
  const secrets = secretNames(...text);
  const links: Array<{ title: string; items: MapLink[] }> = [
    { title: "Found in this task", items: found.map((url) => ({ label: labelFor(url), url })) },
    { title: "Repo files this task points to", items: files },
    { title: "Where to do it", items: [...secretLinks(project, ...text), ...serviceLinks(...text)] },
    { title: "Project links", items: project.links },
    { title: "Repository", items: repoLinks(project, task.title) },
    { title: "Tools this project uses", items: toolLinks(project.tools, project) },
  ].filter((g) => g.items.length);
  const decisions = entries.filter((e) => e.kind === "decision" && e.decision_status === "accepted");
  const proposed = entries.filter((e) => e.kind === "decision" && e.decision_status === "proposed");
  // The task's thread: comments and agent reports attached to it, oldest first.
  // Entries written before threads existed matched by title, so they still show.
  const thread = entries
    .filter((e) => e.task_id === task.id || (e.kind === "progress" && !e.task_id && e.title.includes(task.title)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const branch = `claude/${slug(task.title)}`;
  const brief = [
    `Task: ${taskPath(task, tasks)}`,
    `Project: ${project.name}${project.owner && project.repo ? ` (${project.owner}/${project.repo})` : ""}`,
    `Task id: ${task.id} · priority ${task.priority}${task.due_date ? ` · due ${task.due_date}` : ""}`,
    task.acceptance ? `\nDone when:\n${task.acceptance}` : "",
    task.notes ? `\nNotes:\n${task.notes}` : "",
    project.agent_instructions ? `\nBuild instructions:\n${project.agent_instructions}` : "",
    decisions.length ? `\nDecisions to respect:\n${decisions.map((d) => `- ${d.title}`).join("\n")}` : "",
    `\nWork on branch ${branch}. When finished, report what changed and how it was checked.`,
  ]
    .filter(Boolean)
    .join("\n");
  const report = `Done: ${task.title}${task.acceptance ? `\nChecked against: ${task.acceptance.replace(/\n+/g, "; ")}` : ""}\nEvidence: <PR, URL or screenshot>`;

  const next = mine.find((t) => t.status === "doing") ?? mine[0];
  const freshlyDone = done && task.done_at && daysSince(task.done_at) < 1;

  return (
    <div>
      {/* breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 mono-label-dim mb-8">
        <Link href="/tasks" className="hover:text-accent inline-flex items-center gap-2">
          <span className="rotate-180 inline-block"><GlyphArrow size={11} /></span>
          My tasks
        </Link>
        <span>/</span>
        <Link href={`/projects/${project.id}?task=${task.id}`} className="hover:text-accent">{project.name}</Link>
        {chain.map((p) => (
          <span key={p.id} className="contents">
            <span>/</span>
            <Link href={taskHref(p.id)} className="hover:text-accent">{p.title}</Link>
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Link href={`/queue?status=${task.status}`} title="All tasks with this status" className="hover:opacity-80">
          <Chip tone={task.status === "blocked" ? "solid" : task.status === "doing" ? "accent" : "dim"}>{task.status}</Chip>
        </Link>
        <Link href={`/projects/${project.id}?tab=plan&task=${task.id}`} title="See it in the project plan" className="hover:opacity-80">
          <Chip tone={task.priority === "critical" ? "solid" : "dim"}>
            {PRIORITY_MARK[task.priority]} {task.priority}
          </Chip>
        </Link>
        {ready ? <Chip tone="accent">ready</Chip> : null}
        {late ? <Chip tone="solid">{dueLabel(task.due_date)}</Chip> : null}
        {task.planned_for === day && !done ? <Chip tone="accent">today</Chip> : null}
        {task.recurrence ? <Chip title="Finishing it creates the next occurrence">↻ {RECURRENCE_META[task.recurrence].short}</Chip> : null}
        {isSnoozed(task) ? <Chip>snoozed until {fmtDate(task.snoozed_until)}</Chip> : null}
        {task.estimate ? <Chip>{task.estimate} pt</Chip> : null}
        {task.labels.map((l) => (
          <Link key={l} href={`/queue?label=${encodeURIComponent(l)}`} title={`All tasks labelled ${l}`}>
            <Chip>+{l}</Chip>
          </Link>
        ))}
        {milestone ? (
          <Link href={`/projects/${project.id}?tab=plan`} className="font-mono text-[0.6rem] text-fg-dim hover:text-accent">
            ◆ {milestone.title}{milestone.target_date ? ` · ${fmtDate(milestone.target_date)}` : ""}
          </Link>
        ) : null}
      </div>
      <h1 className="serif-display text-[2.2rem] md:text-[3rem] leading-[1.05] mb-4">
        <InlineText value={task.title} onSave={(title) => title && patch(task.id, { title })} />
      </h1>

      <p className="text-fg-dim text-[0.95rem] leading-relaxed max-w-3xl mb-6">
        {humanOnly
          ? "Only you can do this one. Everything needed to finish it is on this page: what done means, the steps, the links and the text to paste."
          : task.agent
            ? (
              <>
                Assigned to{" "}
                <Link href={facetHref("agent", task.agent)} className="text-accent hover:text-fg">@{task.agent}</Link>. Hand
                it over with the brief below, or take it yourself.
              </>
            )
            : "Nobody owns this yet. Take it, or give it to an agent."}
      </p>

      {why && WHY[why] && !done ? (
        <div className="border border-fg bg-bg-warm/80 px-5 py-3 mb-6 text-[0.9rem] text-fg">{WHY[why](task)}</div>
      ) : null}

      {freshlyDone ? (
        <div className="border border-accent bg-[rgba(139,115,85,0.06)] px-5 py-4 mb-6 glow-anchor">
          <div className="mono-label mb-1">Done. Next up</div>
          {next ? (
            <Link href={taskHref(next.id)} className="text-[1.05rem] text-fg hover:text-accent">
              {next.title} <span className="font-mono text-[0.6rem] text-fg-ghost">· {next.project_name} →</span>
            </Link>
          ) : (
            <Link href="/tasks" className="text-[1rem] text-fg hover:text-accent">
              Nothing else is assigned to you. See what still needs a decision →
            </Link>
          )}
        </div>
      ) : null}

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2 border-y border-line py-4 mb-10">
        {task.status !== "doing" && !done ? (
          <button className={btnPrimary} disabled={saving} onClick={() => patch(task.id, { status: "doing" })}>Start</button>
        ) : null}
        {!done ? (
          <button className={btnPrimary} disabled={saving || (!!waiting.length && task.status === "todo")} onClick={() => patch(task.id, { status: "done" })} title={waiting.length ? "Finish what it's waiting on first" : undefined}>
            Mark done
          </button>
        ) : (
          <button className={btnGhost} disabled={saving} onClick={() => patch(task.id, { status: "todo" })}>Reopen</button>
        )}
        {task.status === "blocked" ? (
          <button className={btnGhost} disabled={saving} onClick={() => patch(task.id, { status: "todo" })}>Unblock</button>
        ) : !done ? (
          <button className={btnGhost} onClick={() => setBlockNote(blockNote === null ? "" : null)}>I&apos;m blocked</button>
        ) : null}
        <span className="mx-2 h-4 w-px bg-line" />
        {!done ? (
          <button
            className={btnGhost}
            disabled={saving}
            onClick={() => patch(task.id, { planned_for: task.planned_for === day ? null : day })}
            title={task.planned_for === day ? "Remove from today's plan" : "Put it on today's plan"}
          >
            {task.planned_for === day ? "Unplan" : "Plan today"}
          </button>
        ) : null}
        {!done && !isSnoozed(task) ? (
          <button className={btnGhost} disabled={saving} onClick={() => patch(task.id, { snoozed_until: addDays(day, 7) })} title="Hide it from Today and My tasks for a week">
            Snooze 1w
          </button>
        ) : null}
        {isSnoozed(task) ? (
          <button className={btnGhost} disabled={saving} onClick={() => patch(task.id, { snoozed_until: null })}>Wake</button>
        ) : null}
        {!humanOnly ? (
          <button className={btnGhost} disabled={saving} onClick={() => patch(task.id, { agent: ME })}>Take it myself</button>
        ) : null}
        {agents.length ? (
          <select
            value={humanOnly ? "" : task.agent ?? ""}
            onChange={(e) => e.target.value && patch(task.id, { agent: e.target.value })}
            className="font-mono text-[0.6rem] uppercase tracking-[0.15em] border border-line bg-bg px-2 py-1.5 text-fg-dim"
          >
            <option value="">Hand to agent…</option>
            {agents.map((a) => <option key={a} value={a}>@{a}</option>)}
          </select>
        ) : null}
        <label className="flex items-center gap-2 font-mono text-[0.6rem] text-fg-dim ml-auto">
          Due
          <input
            type="date"
            value={task.due_date ?? ""}
            onChange={(e) => patch(task.id, { due_date: e.target.value || null })}
            className="bg-transparent font-mono text-[0.65rem] text-fg outline-none border border-line px-2 py-1"
          />
        </label>
        {saving ? <span className="font-mono text-[0.58rem] text-fg-ghost">saving…</span> : null}
      </div>
      {blockNote !== null ? (
        <div className="border border-line bg-bg-warm/80 p-4 mb-8 -mt-6 flex flex-col gap-2">
          <span className="mono-label">What&apos;s in the way?</span>
          <textarea value={blockNote} onChange={(e) => setBlockNote(e.target.value)} rows={3} className={inputCls} placeholder="Waiting on access to …, need a decision on …" />
          <div className="flex gap-2">
            <button
              className={btnPrimary}
              disabled={!blockNote.trim()}
              onClick={() => {
                const notes = `${task.notes ? `${task.notes}\n\n` : ""}Blocked ${today()}: ${blockNote.trim()}`;
                patch(task.id, { status: "blocked", notes });
                setBlockNote(null);
              }}
            >
              Mark blocked
            </button>
            <button className={btnGhost} onClick={() => setBlockNote(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mb-6 font-mono text-xs text-accent flex justify-between border border-line px-4 py-2 bg-bg-warm/80">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-fg-ghost hover:text-fg">dismiss</button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-12">
        <div className="flex flex-col gap-10 min-w-0">
          <Block n="1" title="Done when" hint="The finish line. If it's vague, sharpen it before you start.">
            <div className="border border-accent bg-[rgba(139,115,85,0.04)] p-4 text-[0.95rem] leading-relaxed">
              <EditableMarkdown value={task.acceptance} placeholder="No finish line yet. Click to write one, e.g. 'Domain resolves and SSL is green'." onSave={(acceptance) => patch(task.id, { acceptance })} />
            </div>
          </Block>

          <Block n="2" title="Steps" hint={
              steps.length
                ? "Pulled from the task notes. Ticks are saved in this browser."
                : files.length
                  ? "The notes point at repo docs for the detail. Lines written as '- step' in the notes show here as a checklist."
                  : "No step list in the notes. Write them as '- step' lines and they appear here as a checklist."
            }>
            {waiting.length ? (
              <div className="border border-fg px-4 py-3 mb-4 text-[0.88rem]">
                First finish what this waits on:
                <ul className="mt-2 flex flex-col gap-1">
                  {waiting.map((w) => (
                    <li key={w.id}>
                      <Link href={taskHref(w.id)} className="text-accent hover:text-fg">{w.title} ({w.status}) →</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {steps.length ? <StepList id={task.id} steps={steps} /> : null}
            {!steps.length && files.length ? (
              <div className="border border-line bg-bg/70 px-4 py-3 text-[0.88rem]">
                The steps are written up in the repo:
                <ul className="mt-2 flex flex-col gap-1">
                  {files.map((f) => (
                    <li key={f.url}>
                      <a href={f.url} target="_blank" rel="noreferrer" className="text-accent hover:text-fg font-mono text-[0.8rem]">{f.label} ↗</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {subtasks.length ? (
              <ul className="flex flex-col mt-3">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-baseline gap-3 py-1.5 border-b border-line">
                    <input type="checkbox" checked={s.status === "done"} onChange={() => patch(s.id, { status: s.status === "done" ? "todo" : "done" })} className="accent-[#8b7355] shrink-0" />
                    <Link href={taskHref(s.id)} className={`flex-1 min-w-0 text-[0.9rem] hover:text-accent ${s.status === "done" ? "line-through text-fg-ghost" : ""}`}>
                      {s.title}
                    </Link>
                    <span className="font-mono text-[0.58rem] text-fg-ghost">
                      {s.agent && s.agent !== ME ? (
                        <>
                          <Link href={facetHref("agent", s.agent)} className="hover:text-accent">@{s.agent}</Link>
                          {" · "}
                        </>
                      ) : s.agent ? `@${s.agent} · ` : ""}
                      {s.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <details className="mt-4" open={!steps.length}>
              <summary className="mono-label-dim cursor-pointer">Notes</summary>
              <div className="mt-2 border border-line bg-bg/70 p-3 text-[0.88rem] leading-relaxed text-fg-dim min-h-[4rem]">
                <EditableMarkdown value={task.notes} placeholder={"Add context, links and steps (Markdown):\n- first step\n- second step"} onSave={(notes) => patch(task.id, { notes })} />
              </div>
            </details>
          </Block>

          <Block n="3" title="Thread" hint={task.agent && task.agent !== ME ? `Progress reports from @${task.agent} and your replies. An agent reads this thread through the API, so a reply here answers its question.` : "Progress notes and comments on this task, oldest first."}>
            {thread.length ? (
              <ol className="flex flex-col gap-3 mb-4">
                {thread.map((e) => {
                  const mine = e.author === ME;
                  return (
                    <li key={e.id} className={`border px-4 py-3 ${mine ? "border-accent bg-[rgba(139,115,85,0.05)]" : "border-line bg-bg/70"}`}>
                      <div className="flex items-baseline gap-3 mb-1 font-mono text-[0.58rem] text-fg-ghost">
                        <span className={mine ? "text-accent" : "text-fg"}>{e.author ? `@${e.author}` : "system"}</span>
                        <span title={new Date(e.created_at).toLocaleString()}>{relTime(e.created_at)}</span>
                        {e.kind !== "progress" ? <span>{e.kind}</span> : null}
                      </div>
                      {e.body && e.body !== e.title ? (
                        <>
                          {e.title && !e.body.startsWith(e.title) ? <div className="text-[0.85rem] text-fg mb-1">{e.title}</div> : null}
                          <Markdown text={e.body} className="text-[0.88rem] text-fg leading-relaxed" />
                        </>
                      ) : (
                        <div className="text-[0.88rem] text-fg">{e.title}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-fg-ghost text-[0.85rem] mb-3">Nothing in the thread yet.</p>
            )}
            <div className="flex flex-col gap-2">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  // The shortcut posts the reply; unblocking is the explicit button, so a quick answer cannot reopen work by accident.
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(false);
                }}
                rows={2}
                placeholder={task.status === "blocked" ? "Answer the blocker…" : "Add a note or reply… (Markdown, ⌘↵ to send)"}
                className={inputCls}
              />
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} disabled={saving || !reply.trim()} onClick={() => sendReply(false)}>Post</button>
                {task.status === "blocked" ? (
                  <button className={btnGhost} disabled={saving || !reply.trim()} onClick={() => sendReply(true)} title="Post the reply and set the task back to todo">Reply and unblock</button>
                ) : null}
              </div>
            </div>
          </Block>

          <Block n="4" title="Copy and paste" hint="Ready-made text for this task. Click Copy on any block.">
            <div className="flex flex-col gap-4">
              {snippets.map((s, i) => (
                <Copy key={i} label={i === 0 ? "From the notes" : undefined} text={s} />
              ))}
              {secrets.map((name, i) => (
                <Copy key={name} label={i === 0 ? "Secret and variable names (paste as the Name; the value comes from the service)" : undefined} text={name} />
              ))}
              {humanOnly ? (
                <Copy label="Report when done (paste into a PR, message or the project log)" text={report} />
              ) : (
                <Copy label={`Brief for ${task.agent ? `@${task.agent}` : "an agent"} (paste into its session)`} text={brief} />
              )}
              {project.owner && project.repo && !humanOnly ? (
                <Copy label="Start a branch for it" text={`git checkout -b ${branch}`} />
              ) : null}
              {humanOnly ? (
                <details>
                  <summary className="mono-label-dim cursor-pointer">Brief, if you'd rather hand it to an agent</summary>
                  <div className="mt-2"><CopyBlock text={brief} /></div>
                </details>
              ) : (
                <Copy label="Report when done" text={report} />
              )}
            </div>
          </Block>

          {deps.length || unblocks.length ? (
            <Block n="5" title="Connected tasks" hint="What this needs, and what it frees up when it's done.">
              <div className="grid md:grid-cols-2 gap-6">
                <TaskLinks title="Needs first" tasks={deps} empty="Nothing." />
                <TaskLinks title="Unblocks" tasks={unblocks} empty="Nothing waits on this." />
              </div>
            </Block>
          ) : null}
        </div>

        <aside className="flex flex-col gap-8 min-w-0">
          <Side title="Links">
            {links.length ? (
              links.map((g) => (
                <div key={g.title} className="mb-4">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-fg-ghost mb-1">{g.title}</div>
                  <ul className="flex flex-col">
                    {g.items.map((l) => (
                      <li key={l.url + l.label}>
                        <a href={l.url} target="_blank" rel="noreferrer" className="block py-1 text-[0.85rem] text-fg hover:text-accent truncate">
                          {l.label} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="text-fg-ghost text-[0.8rem]">
                No links yet. Paste URLs into the notes, or add project links and a repo in{" "}
                <Link href={`/projects/${project.id}?tab=setup`} className="text-accent underline">Setup</Link>.
              </p>
            )}
          </Side>

          <Side title="Fields">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[0.6rem]">
              <label className="flex flex-col gap-1 text-fg-ghost">
                estimate
                <select value={task.estimate ?? ""} onChange={(e) => patch(task.id, { estimate: e.target.value ? Number(e.target.value) : null })} className={inputBase}>
                  <option value="">none</option>
                  {ESTIMATES.map((n) => (
                    <option key={n} value={n}>
                      {n} pt
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-fg-ghost">
                repeats
                <select value={task.recurrence ?? ""} onChange={(e) => patch(task.id, { recurrence: (e.target.value || null) as Task["recurrence"] })} className={inputBase}>
                  <option value="">never</option>
                  {RECURRENCES.map((r) => (
                    <option key={r} value={r}>
                      {RECURRENCE_META[r].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-fg-ghost">
                planned for
                <input type="date" value={task.planned_for ?? ""} onChange={(e) => patch(task.id, { planned_for: e.target.value || null })} className={inputBase} />
              </label>
              <label className="flex flex-col gap-1 text-fg-ghost">
                snoozed until
                <input type="date" value={task.snoozed_until ?? ""} onChange={(e) => patch(task.id, { snoozed_until: e.target.value || null })} className={inputBase} />
              </label>
            </div>
            <div className="mt-3">
              <TagInput value={task.labels} onChange={(labels) => patch(task.id, { labels })} suggestions={LABEL_PRESETS} placeholder="add label…" prefix="+" />
            </div>
          </Side>

          <Side title="Context">
            <dl className="flex flex-col gap-3 text-[0.82rem]">
              <Fact k="Project">
                <Link href={`/projects/${project.id}?task=${task.id}`} className="text-fg hover:text-accent">{project.name} →</Link>
                {!workable ? <span className="block text-fg-ghost text-[0.75rem]">Project is {project.status}; agents won&apos;t pick this up.</span> : null}
              </Fact>
              {project.next_action ? (
                <Fact k="Project next action">
                  <Link href={projectHref(project.id)} className="hover:text-accent">{project.next_action}</Link>
                </Fact>
              ) : null}
              {project.summary ? (
                <Fact k="About">
                  <Link href={`${projectHref(project.id)}?tab=setup`} className="hover:text-accent">{project.summary}</Link>
                </Fact>
              ) : null}
              <Fact k="History">
                Created {fmtDate(task.created_at)} · updated {relTime(task.updated_at)}
                {task.done_at ? ` · done ${fmtDate(task.done_at)}` : ""}
              </Fact>
            </dl>
            {proposed.length ? (
              <div className="mt-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-fg mb-1">Decisions waiting on you</div>
                <EntryLinks projectId={project.id} entries={proposed} fix />
              </div>
            ) : null}
            {decisions.length ? (
              <div className="mt-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-fg-ghost mb-1">Decisions to respect</div>
                <EntryLinks projectId={project.id} entries={decisions.slice(0, 6)} />
              </div>
            ) : null}
            {project.agent_instructions ? (
              <details className="mt-4">
                <summary className="mono-label-dim cursor-pointer">Build instructions</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[0.68rem] text-fg-dim leading-relaxed">{project.agent_instructions}</pre>
              </details>
            ) : null}
          </Side>

          <Side title="Your other tasks">
            {mine.length ? (
              <ul className="flex flex-col">
                {mine.map((t) => (
                  <li key={t.id}>
                    <Link href={taskHref(t.id)} className="flex items-baseline gap-2 py-1.5 border-b border-line hover:text-accent">
                      <span className="flex-1 min-w-0 truncate text-[0.82rem]">{t.title}</span>
                      <span className="font-mono text-[0.55rem] text-fg-ghost shrink-0">
                        {t.status === "doing" ? "doing " : dueLabel(t.due_date) ? `${dueLabel(t.due_date)} ` : ""}
                        <SubLink href={projectHref(t.project_id)}>{t.project_name}</SubLink>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-ghost text-[0.8rem]">Nothing else is assigned to @{ME}.</p>
            )}
            <Link href="/tasks" className="block mt-3 font-mono text-[0.58rem] uppercase tracking-[0.18em] text-accent hover:text-fg">All my tasks →</Link>
          </Side>
        </aside>
      </div>
    </div>
  );
}

function StepList({ id, steps }: { id: string; steps: string[] }) {
  const key = `mythic-steps:${id}`;
  const [ticked, setTicked] = useState<number[]>([]);
  useEffect(() => {
    try {
      setTicked(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setTicked([]);
    }
  }, [key]);
  const toggle = (i: number) => {
    const n = ticked.includes(i) ? ticked.filter((x) => x !== i) : [...ticked, i];
    setTicked(n);
    try {
      localStorage.setItem(key, JSON.stringify(n));
    } catch {
      // Ticks are a convenience; losing them is fine.
    }
  };
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const on = ticked.includes(i);
        const urls = extractUrls(s);
        return (
          <li key={i} className="flex items-baseline gap-3 py-2 border-b border-line">
            <input type="checkbox" checked={on} onChange={() => toggle(i)} className="accent-[#8b7355] shrink-0" />
            <span className="font-mono text-[0.6rem] text-fg-ghost w-4 shrink-0">{i + 1}</span>
            <span className={`flex-1 min-w-0 text-[0.92rem] break-words ${on ? "line-through text-fg-ghost" : "text-fg"}`}>
              {s.split(/(`[^`]+`)/).map((part, j) =>
                /^`[^`]+`$/.test(part) ? <CopyChip key={j} text={part.slice(1, -1)} /> : part
              )}
              {urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="ml-2 font-mono text-[0.6rem] text-accent hover:text-fg">open ↗</a>
              ))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Inline `code` from a step: click to copy it. */
function CopyChip({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => {})}
      className="mx-0.5 font-mono text-[0.8em] border border-line bg-bg px-1.5 py-0.5 hover:border-accent"
      title="Click to copy"
    >
      {text} <span className="text-[0.7em] text-accent">{done ? "copied" : "copy"}</span>
    </button>
  );
}

function Block({ n, title, hint, children }: { n: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="font-mono text-[0.6rem] text-accent">{n}</span>
        <h2 className="text-[1.05rem] font-medium text-fg">{title}</h2>
      </div>
      <p className="text-fg-ghost text-[0.78rem] mb-3">{hint}</p>
      {children}
    </section>
  );
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="hairline-accent-sm mb-3"><span className="mono-label">{title}</span></div>
      {children}
    </section>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-fg-ghost">{k}</dt>
      <dd className="text-fg-dim leading-relaxed">{children}</dd>
    </div>
  );
}

function Copy({ label, text }: { label?: string; text: string }) {
  return (
    <div>
      {label ? <div className="font-mono text-[0.58rem] text-fg-ghost mb-1">{label}</div> : null}
      <CopyBlock text={text} />
    </div>
  );
}

function TaskLinks({ title, tasks, empty }: { title: string; tasks: Task[]; empty: string }) {
  return (
    <div>
      <div className="mono-label-dim mb-1">{title}</div>
      {tasks.length ? (
        <ul className="flex flex-col">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link href={taskHref(t.id)} className="flex items-baseline gap-2 py-1.5 border-b border-line hover:text-accent">
                <span className={`flex-1 min-w-0 truncate text-[0.85rem] ${t.status === "done" ? "line-through text-fg-ghost" : ""}`}>{t.title}</span>
                <span className="font-mono text-[0.55rem] text-fg-ghost">{statusLabel(t.status)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-ghost text-[0.8rem]">{empty}</p>
      )}
    </div>
  );
}

function EntryLinks({ projectId, entries, fix }: { projectId: string; entries: Entry[]; fix?: boolean }) {
  return (
    <ul className="flex flex-col">
      {entries.map((e) => (
        <li key={e.id}>
          <Link
            href={fix ? `/fix?key=${encodeURIComponent(`${projectId}:decision:${e.id}`)}` : `/projects/${projectId}?tab=decisions&entry=${e.id}`}
            className="block py-1 text-[0.82rem] text-fg hover:text-accent truncate"
          >
            {e.title} →
          </Link>
        </li>
      ))}
    </ul>
  );
}

const statusLabel = (s: TaskStatus) => (s === "doing" ? "in progress" : s);

