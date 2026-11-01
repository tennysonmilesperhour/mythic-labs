"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AGENT_PRESETS,
  PRIORITIES,
  STATUS_META,
  TOOL_PRESETS,
  HEALTH_META,
  computeAttention,
  computeStats,
  latestUpdate,
  projectHealth,
  rankReady,
  taskPath,
  fmtDate,
  isOverdue,
  relTime,
  renderProjectMarkdown,
  type Entry,
  type Milestone,
  type Project,
  type ProjectDetail,
  type ProjectLink,
  type Task,
} from "@/lib/projectTypes";
import {
  InlineText,
  Progress,
  StatusToggle,
  TagInput,
  api,
  btnGhost,
  btnPrimary,
  inputBase,
  inputCls,
} from "@/components/ProjectBits";
import CopyBlock from "@/components/CopyBlock";
import { EditableMarkdown } from "@/components/Markdown";
import { HealthChip } from "@/components/HealthChip";
import { facetHref, taskHref, toolLinks } from "@/lib/taskMap";
import { AttentionList } from "@/components/Glance";
import { GlyphArrow, GlyphClose } from "@/components/Glyphs";
import PlanTab from "./PlanTab";
import { ActivityTab, ChangelogTab, DecisionsTab, NotesTab } from "./LogTabs";

const TABS = ["plan", "changelog", "decisions", "notes", "activity", "setup", "agents"] as const;
type Tab = (typeof TABS)[number];

export type Store = {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  entries: Entry[];
  agentOptions: string[];
  focusTask: string | null;
  patchProject: (patch: Partial<Project> & { status_note?: string }) => Promise<void>;
  setMilestones: React.Dispatch<React.SetStateAction<Milestone[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  fail: (msg: string) => void;
};

export default function ProjectDetailClient({
  initial,
  suggestions,
  focusTask,
  initialTab,
  focusEntry,
}: {
  initial: ProjectDetail;
  suggestions: { agents: string[]; tools: string[]; tags: string[] };
  focusTask: string | null;
  /** ?tab= deep link, e.g. from a decision or changelog row elsewhere. */
  initialTab: string | null;
  /** ?entry= deep link: scrolled to and outlined once the tab renders. */
  focusEntry: string | null;
}) {
  const [project, setProject] = useState(initial.project);
  const [milestones, setMilestones] = useState(initial.milestones);
  const [tasks, setTasks] = useState(initial.tasks);
  const [entries, setEntries] = useState(initial.entries);
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "plan");
  // Links within this page (e.g. ?tab=activity) change the prop, not the mount.
  useEffect(() => {
    if (TABS.includes(initialTab as Tab)) setTab(initialTab as Tab);
  }, [initialTab]);
  useEffect(() => {
    if (!focusEntry) return;
    const el = document.getElementById(`entry-${focusEntry}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.classList.add("outline", "outline-1", "outline-accent");
  }, [focusEntry]);
  const [error, setError] = useState<string | null>(null);

  const patchProject: Store["patchProject"] = async (patch) => {
    const prev = project;
    setProject((p) => ({ ...p, ...patch }));
    try {
      const res = await api<{ project: Project; entry: Entry | null }>(
        `/api/projects/${project.id}`,
        "PATCH",
        patch
      );
      setProject(res.project);
      if (res.entry) setEntries((es) => [res.entry!, ...es]);
    } catch (err: unknown) {
      setProject(prev);
      setError((err as Error).message);
    }
  };

  const agentOptions = useMemo(
    () => Array.from(new Set([...project.agents, ...AGENT_PRESETS, ...suggestions.agents])),
    [project.agents, suggestions.agents]
  );

  const store: Store = {
    project,
    milestones,
    tasks,
    entries,
    agentOptions,
    focusTask,
    patchProject,
    setMilestones,
    setTasks,
    setEntries,
    fail: setError,
  };

  const stats = computeStats(tasks, milestones, [...entries.map((e) => e.created_at), project.updated_at]);
  const attention = computeAttention({ project, milestones, tasks, entries }, stats.lastActivity);
  const health = projectHealth({ project, milestones, tasks, entries }, stats, attention);
  const update = latestUpdate(entries);
  const counts: Partial<Record<Tab, number>> = {
    plan: stats.total - stats.done,
    changelog: entries.filter((e) => e.kind === "changelog").length,
    decisions: entries.filter((e) => e.kind === "decision").length,
    notes: entries.filter((e) => e.kind === "note").length,
  };
  const pending = entries.filter((e) => e.kind === "decision" && e.decision_status === "proposed").length;

  return (
    <div>
      <Link href="/projects" className="mono-label-dim hover:text-accent inline-flex items-center gap-2 mb-8">
        <span className="rotate-180 inline-block">
          <GlyphArrow size={11} />
        </span>
        Projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-6 mb-4">
        <div className="min-w-0 flex-1">
          <h1 className="serif-display text-[2.4rem] md:text-[3.4rem] leading-[1] mb-3">
            <InlineText value={project.name} onSave={(v) => v && patchProject({ name: v })} />
          </h1>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[0.65rem] text-fg-dim">
            {project.owner && project.repo ? (
              <a
                href={`https://github.com/${project.owner}/${project.repo}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-accent"
              >
                {project.owner}/{project.repo} ↗
              </a>
            ) : (
              <span className="text-fg-ghost">no repo linked</span>
            )}
            {project.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                {l.label} ↗
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusToggle value={project.status} onChange={(status) => patchProject({ status })} />
          <div className="flex items-center gap-3">
            <HealthChip health={health} />
            <Link href="?tab=activity" className="font-mono text-[0.58rem] text-fg-ghost hover:text-accent" title="Status history in Activity">
              {STATUS_META[project.status].label} since {relTime(project.status_changed_at)}
            </Link>
          </div>
        </div>
      </div>
      {update ? (
        <Link href={`?tab=activity`} className="block mb-4 text-[0.85rem] text-fg-dim hover:text-accent">
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.15em] text-fg-ghost mr-2">
            Update {relTime(update.created_at)}{update.health ? ` · ${HEALTH_META[update.health].label}` : ""}
          </span>
          {update.body.split("\n")[0]}
        </Link>
      ) : null}

      <p className="text-fg-dim text-[1rem] leading-[1.7] max-w-3xl mb-6">
        <InlineText
          value={project.summary}
          placeholder="Add a one-line summary"
          onSave={(summary) => patchProject({ summary })}
        />
      </p>

      <div className="border border-accent bg-[rgba(139,115,85,0.05)] px-5 py-4 mb-8 glow-anchor">
        <div className="mono-label mb-1">Next action</div>
        <div className="text-[1.05rem] text-fg">
          <InlineText
            value={project.next_action}
            placeholder="What's the very next thing to do?"
            onSave={(next_action) => patchProject({ next_action })}
          />
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-baseline gap-3 mb-3">
          <span className="mono-label">Needs attention</span>
          <span className="font-mono text-[0.6rem] text-fg-ghost tnum">{attention.length}</span>
        </div>
        <AttentionList items={attention} limit={5} hideProject empty="All clear: there's a next action, ready work, and nothing late." />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-px bg-line border border-line mb-10">
        <Cell label="Progress" href="?tab=plan">
          <Progress done={stats.done} total={stats.total} />
        </Cell>
        <Cell label="Ready" value={stats.ready} href={firstMap(rankReady(tasks, milestones)[0])} />
        <Cell label="Doing" value={stats.doing} href={firstMap(tasks.find((t) => t.status === "doing"))} />
        <Cell label="Blocked" value={stats.blocked} warn={stats.blocked > 0} href={firstMap(tasks.find((t) => t.status === "blocked"), "blocked")} />
        <Cell
          label="Overdue"
          value={stats.overdue}
          warn={stats.overdue > 0}
          href={firstMap(tasks.find((t) => isOverdue(t.due_date, t.status === "done")), "overdue")}
        />
        <Cell label="Priority">
          <select
            value={project.priority}
            onChange={(e) => patchProject({ priority: e.target.value as Project["priority"] })}
            className="bg-transparent font-mono text-xs text-fg outline-none"
          >
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Cell>
        <Cell label="Start → target">
          <div className="flex flex-col">
            <DateInput value={project.start_date} onChange={(start_date) => patchProject({ start_date })} />
            <DateInput value={project.target_date} onChange={(target_date) => patchProject({ target_date })} />
          </div>
        </Cell>
      </div>

      {error ? (
        <div className="mb-6 font-mono text-xs text-accent flex justify-between border border-line px-4 py-2 bg-bg-warm/80">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-fg-ghost hover:text-fg">
            dismiss
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-px bg-line border border-line mb-8">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 font-mono text-[0.62rem] tracking-[0.22em] uppercase flex items-center gap-2 ${
              tab === t ? "bg-fg text-bg" : "bg-bg/80 text-fg-dim hover:text-fg"
            }`}
          >
            {t}
            {counts[t] ? <span className="tnum opacity-60">{counts[t]}</span> : null}
            {t === "decisions" && pending ? <span className="text-accent">· {pending} to decide</span> : null}
          </button>
        ))}
      </div>

      {tab === "plan" ? <PlanTab store={store} /> : null}
      {tab === "changelog" ? <ChangelogTab store={store} /> : null}
      {tab === "decisions" ? <DecisionsTab store={store} /> : null}
      {tab === "notes" ? <NotesTab store={store} /> : null}
      {tab === "activity" ? <ActivityTab store={store} /> : null}
      {tab === "setup" ? <SetupTab store={store} suggestions={suggestions} /> : null}
      {tab === "agents" ? <AgentsTab store={store} /> : null}
    </div>
  );
}

// The first task the number counts; with none, the plan is the next place to look.
const firstMap = (t: Task | undefined, why?: string) => (t ? taskHref(t.id, why) : "?tab=plan");

function Cell({
  label,
  value,
  warn,
  href,
  children,
}: {
  label: string;
  value?: number;
  warn?: boolean;
  /** The first task this number counts, so the count opens straight into it. */
  href?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className={warn ? "mono-label mb-2" : "mono-label-dim mb-2"}>{label}</div>
      {children ?? (
        <div className={`serif-display text-[1.8rem] leading-none tnum ${warn ? "text-accent" : ""}`}>{value}</div>
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="block bg-bg/85 px-4 py-3 min-w-0 hover:bg-bg-warm"
      title={href.startsWith("?") ? "Open the plan" : `Open the first ${label.toLowerCase()} task`}
    >
      {inner}
    </Link>
  ) : (
    <div className="bg-bg/85 px-4 py-3 min-w-0">{inner}</div>
  );
}

export function DateInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="bg-transparent font-mono text-[0.6rem] text-fg-dim outline-none w-[6.8rem]"
    />
  );
}

function SetupTab({
  store,
  suggestions,
}: {
  store: Store;
  suggestions: { agents: string[]; tools: string[]; tags: string[] };
}) {
  const { project, patchProject } = store;
  const router = useRouter();
  const [repo, setRepo] = useState(project.owner && project.repo ? `${project.owner}/${project.repo}` : "");
  const [link, setLink] = useState<ProjectLink>({ label: "", url: "" });

  const saveRepo = () => {
    const cleaned = repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
    const [owner, r] = cleaned.split("/").filter(Boolean);
    patchProject({ owner: owner || null, repo: r || null });
  };

  const remove = async () => {
    if (!confirm(`Delete "${project.name}" and its whole plan, changelog and decision log? This cannot be undone.`)) return;
    await api(`/api/projects/${project.id}`, "DELETE");
    router.push("/projects");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Section title="Assigned agents" hint="Who works on this. Tasks can be assigned to any of them.">
        <TagInput
          value={project.agents}
          onChange={(agents) => patchProject({ agents })}
          suggestions={Array.from(new Set([...AGENT_PRESETS, ...suggestions.agents]))}
          placeholder="add agent…"
          prefix="@"
        />
        <ChipLinks items={project.agents.map((a) => ({ label: `@${a}`, href: facetHref("agent", a) }))} hint="projects with" />
      </Section>
      <Section title="Connected tools" hint="MCP servers, services and brain plugins this project relies on.">
        <TagInput
          value={project.tools}
          onChange={(tools) => patchProject({ tools })}
          suggestions={Array.from(new Set([...TOOL_PRESETS, ...suggestions.tools]))}
          placeholder="add tool…"
        />
        <ChipLinks items={toolLinks(project.tools, project).map((l) => ({ label: l.label, href: l.url }))} hint="open" />
      </Section>
      <Section title="Tags">
        <TagInput
          value={project.tags}
          onChange={(tags) => patchProject({ tags })}
          suggestions={suggestions.tags}
          placeholder="add tag…"
        />
        <ChipLinks items={project.tags.map((t) => ({ label: t, href: facetHref("tag", t) }))} hint="projects tagged" />
      </Section>
      <Section title="GitHub repo" hint="Enables the changelog importer.">
        <div className="flex gap-2">
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" className={inputCls} />
          <button onClick={saveRepo} className={btnGhost}>
            Save
          </button>
        </div>
      </Section>
      <Section title="Links" hint="Production URL, staging, docs, designs, boards.">
        <div className="flex flex-col gap-1.5 mb-3">
          {project.links.map((l, i) => (
            <div key={i} className="flex items-center gap-3 font-mono text-xs">
              <span className="text-fg w-28 truncate">{l.label}</span>
              <a href={l.url} target="_blank" rel="noreferrer" className="text-fg-dim hover:text-accent truncate flex-1">
                {l.url}
              </a>
              <button
                onClick={() => patchProject({ links: project.links.filter((_, j) => j !== i) })}
                className="text-fg-ghost hover:text-fg"
              >
                <GlyphClose size={10} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={link.label}
            onChange={(e) => setLink({ ...link, label: e.target.value })}
            placeholder="Label"
            className={`${inputBase} w-32`}
          />
          <input
            value={link.url}
            onChange={(e) => setLink({ ...link, url: e.target.value })}
            placeholder="https://…"
            className={inputCls}
          />
          <button
            disabled={!link.url.trim()}
            onClick={() => {
              const url = /^https?:\/\//.test(link.url.trim()) ? link.url.trim() : `https://${link.url.trim()}`;
              patchProject({ links: [...project.links, { label: link.label.trim() || new URL(url).hostname, url }] });
              setLink({ label: "", url: "" });
            }}
            className={btnGhost}
          >
            Add
          </button>
        </div>
      </Section>
      <Section title="Overview" hint="Longer description: scope, audience, constraints. Click to edit.">
        <div className="text-[0.9rem] leading-[1.7] text-fg-dim border border-line bg-bg/70 p-3 min-h-[6rem]">
          <EditableMarkdown
            value={project.description}
            placeholder="Describe the project… (Markdown)"
            onSave={(description) => patchProject({ description })}
          />
        </div>
      </Section>
      <div className="lg:col-span-2">
        <Section
          title="Build instructions for agents"
          hint="Everything an autonomous agent needs to work without asking: setup, branch and PR rules, how to test, definition of done, what never to touch. Included in every agent brief and API response."
        >
          <div className="text-[0.85rem] leading-[1.7] text-fg-dim border border-line bg-bg/70 p-3 min-h-[8rem] font-mono">
            <InlineText
              multiline
              value={project.agent_instructions}
              placeholder={INSTRUCTIONS_TEMPLATE}
              onSave={(agent_instructions) => patchProject({ agent_instructions })}
            />
          </div>
          {!project.agent_instructions ? (
            <button className={`${btnGhost} mt-2`} onClick={() => patchProject({ agent_instructions: INSTRUCTIONS_TEMPLATE })}>
              Start from template
            </button>
          ) : null}
        </Section>
      </div>
      <div className="lg:col-span-2 border-t border-line pt-6 flex items-center justify-between">
        <span className="font-mono text-[0.6rem] text-fg-ghost">
          Created {fmtDate(project.created_at)} · updated {relTime(project.updated_at)}
        </span>
        <button onClick={remove} className={btnGhost}>
          Delete project
        </button>
      </div>
    </div>
  );
}

/** Links under an editable chip input: the chips themselves stay editable. */
function ChipLinks({ items, hint }: { items: Array<{ label: string; href: string }>; hint: string }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-2 font-mono text-[0.58rem] text-fg-ghost">
      <span>{hint}:</span>
      {items.map((i) =>
        /^https?:\/\//.test(i.href) ? (
          <a key={i.href + i.label} href={i.href} target="_blank" rel="noreferrer" className="text-fg-dim hover:text-accent">
            {i.label} ↗
          </a>
        ) : (
          <Link key={i.href} href={i.href} className="text-fg-dim hover:text-accent">
            {i.label} →
          </Link>
        )
      )}
    </div>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="hairline-accent-sm mb-2">
        <span className="mono-label">{title}</span>
      </div>
      {hint ? <p className="text-fg-ghost text-[0.78rem] mb-3">{hint}</p> : null}
      {children}
    </section>
  );
}

export const INSTRUCTIONS_TEMPLATE = `Setup: npm ci, then npm run dev
Branch: claude/<short-task-name> off main; open a draft PR per task
Checks before pushing: npm run lint && npm test && npm run build
Definition of done: acceptance criteria met, checks green, PR open, changelog entry logged
Never: touch production data, rotate secrets, or merge without review
Ask (mark the task blocked with a note) when: requirements are ambiguous or a decision is architectural`;

/** Brief, roadmap export and the agent API for this project. */
function AgentsTab({ store }: { store: Store }) {
  const { project, tasks, milestones, entries } = store;
  const [agent, setAgent] = useState<string>(project.agents.find((a) => a !== "me") ?? "");
  const detail = { project, milestones, tasks, entries };
  const markdown = renderProjectMarkdown(detail);
  const origin = typeof window === "undefined" ? "https://<dashboard>" : window.location.origin;

  const brief = useMemo(() => {
    const ready = rankReady(tasks, milestones).filter((t) => !agent || !t.agent || t.agent === agent);
    const doing = tasks.filter((t) => t.status === "doing" && (!agent || t.agent === agent));
    const decisions = entries.filter((e) => e.kind === "decision" && e.decision_status === "accepted");
    const line = (t: Task) =>
      [
        `- [ ] ${taskPath(t, tasks)} · ${t.priority}${t.due_date ? ` · due ${t.due_date}` : ""} · id \`${t.id}\``,
        t.acceptance ? `  - done when: ${t.acceptance.replace(/\n+/g, " ")}` : "",
        t.notes ? `  - notes: ${t.notes.replace(/\n+/g, " ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    return [
      `You're ${agent ? `@${agent}, ` : ""}working on **${project.name}**${project.owner && project.repo ? ` (${project.owner}/${project.repo})` : ""}.`,
      project.summary,
      project.next_action ? `Next action: ${project.next_action}` : "",
      project.agent_instructions ? `## Build instructions\n${project.agent_instructions}` : "",
      doing.length ? `## Already in progress\n${doing.map(line).join("\n")}` : "",
      `## Ready, in order\n${ready.length ? ready.slice(0, 10).map(line).join("\n") : "- nothing ready: stop and report back"}`,
      decisions.length ? `## Decisions to respect\n${decisions.map((d) => `- ${d.title}${d.body ? `: ${d.body}` : ""}`).join("\n")}` : "",
      project.tools.length ? `Tools: ${project.tools.join(", ")}` : "",
      "## Loop\nTake the first ready task. Meet its done-when criteria. Report progress, log a changelog entry, and record any decision as proposed. If stuck, mark it blocked with the reason. Then take the next one.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }, [agent, project, tasks, milestones, entries]);

  const name = agent || "claude-code";
  const api = [
    `export MYTHIC_PM_URL=${origin}`,
    `export MYTHIC_PM_TOKEN=<PM_AGENT_TOKEN>`,
    `H="Authorization: Bearer $MYTHIC_PM_TOKEN"`,
    ``,
    `# next ready task in this project`,
    `curl -s -H "$H" "$MYTHIC_PM_URL/api/agent/next?agent=${name}&project=${project.id}"`,
    `# claim it`,
    `curl -s -X POST -H "$H" "$MYTHIC_PM_URL/api/agent/tasks/<task-id>/claim?agent=${name}"`,
    `# report (status: doing | blocked | done; blocked needs a note)`,
    `curl -s -X PATCH -H "$H" -H 'content-type: application/json' \\`,
    `  -d '{"status":"done","note":"PR #12 open, checks green"}' \\`,
    `  "$MYTHIC_PM_URL/api/agent/tasks/<task-id>?agent=${name}"`,
    `# log a changelog entry or propose a decision`,
    `curl -s -X POST -H "$H" -H 'content-type: application/json' \\`,
    `  -d '{"kind":"changelog","change_type":"added","title":"OAuth login"}' \\`,
    `  "$MYTHIC_PM_URL/api/agent/projects/${project.id}/entries?agent=${name}"`,
    `# the whole roadmap, as Markdown`,
    `curl -s -H "$H" "$MYTHIC_PM_URL/api/agent/roadmap"`,
  ].join("\n");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Section title="Agent brief" hint="Paste into any agent session. Ready tasks come first, in the order they should be done.">
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className={`${inputCls} mb-3`}>
          <option value="">Any agent</option>
          {store.agentOptions.map((a) => (
            <option key={a} value={a}>
              @{a}
            </option>
          ))}
        </select>
        <div className="max-h-[36rem] overflow-y-auto">
          <CopyBlock text={brief} />
        </div>
      </Section>
      <div className="flex flex-col gap-8">
        <Section
          title="Agent API"
          hint={
            <>
              For autonomous agents. Set PM_AGENT_TOKEN on the dashboard (
              <Link href="/fix?key=source%3Aagent" className="text-accent hover:text-fg">how</Link>); agents with the{" "}
              <Link href="/brain?plugin=dev-workflows" className="text-accent hover:text-fg">roadmap skill (dev-workflows)</Link>{" "}
              run this loop themselves.
            </>
          }
        >
          <CopyBlock text={api} />
        </Section>
        <Section title="PROJECT.md" hint="The whole project as Markdown. Commit it to the repo or attach it as context.">
          <div className="max-h-[24rem] overflow-y-auto">
            <CopyBlock text={markdown} />
          </div>
          <button
            className={`${btnPrimary} mt-3`}
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
              a.download = "PROJECT.md";
              a.click();
            }}
          >
            Download
          </button>
        </Section>
      </div>
    </div>
  );
}
