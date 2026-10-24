"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AGENT_PRESETS,
  PRIORITIES,
  STATUS_META,
  TOOL_PRESETS,
  computeStats,
  fmtDate,
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
import { GlyphArrow, GlyphClose } from "@/components/Glyphs";
import PlanTab from "./PlanTab";
import { ActivityTab, ChangelogTab, DecisionsTab, NotesTab } from "./LogTabs";

const TABS = ["plan", "changelog", "decisions", "notes", "activity", "setup", "handoff"] as const;
type Tab = (typeof TABS)[number];

export type Store = {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  entries: Entry[];
  agentOptions: string[];
  patchProject: (patch: Partial<Project> & { status_note?: string }) => Promise<void>;
  setMilestones: React.Dispatch<React.SetStateAction<Milestone[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  fail: (msg: string) => void;
};

export default function ProjectDetailClient({
  initial,
  suggestions,
}: {
  initial: ProjectDetail;
  suggestions: { agents: string[]; tools: string[]; tags: string[] };
}) {
  const [project, setProject] = useState(initial.project);
  const [milestones, setMilestones] = useState(initial.milestones);
  const [tasks, setTasks] = useState(initial.tasks);
  const [entries, setEntries] = useState(initial.entries);
  const [tab, setTab] = useState<Tab>("plan");
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
    patchProject,
    setMilestones,
    setTasks,
    setEntries,
    fail: setError,
  };

  const stats = computeStats(tasks, milestones);
  const counts: Partial<Record<Tab, number>> = {
    plan: stats.total - stats.done,
    changelog: entries.filter((e) => e.kind === "changelog").length,
    decisions: entries.filter((e) => e.kind === "decision").length,
    notes: entries.filter((e) => e.kind === "note").length,
  };

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
          <h1 className="serif-display text-[3.4rem] leading-[1] mb-3">
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
          <span className="font-mono text-[0.58rem] text-fg-ghost">
            {STATUS_META[project.status].label} since {relTime(project.status_changed_at)}
          </span>
        </div>
      </div>

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

      <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-line border border-line mb-10">
        <Cell label="Progress">
          <Progress done={stats.done} total={stats.total} />
        </Cell>
        <Cell label="In progress" value={stats.doing} />
        <Cell label="Blocked" value={stats.blocked} warn={stats.blocked > 0} />
        <Cell label="Overdue" value={stats.overdue} warn={stats.overdue > 0} />
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
          </button>
        ))}
      </div>

      {tab === "plan" ? <PlanTab store={store} /> : null}
      {tab === "changelog" ? <ChangelogTab store={store} /> : null}
      {tab === "decisions" ? <DecisionsTab store={store} /> : null}
      {tab === "notes" ? <NotesTab store={store} /> : null}
      {tab === "activity" ? <ActivityTab store={store} /> : null}
      {tab === "setup" ? <SetupTab store={store} suggestions={suggestions} /> : null}
      {tab === "handoff" ? <HandoffTab store={store} /> : null}
    </div>
  );
}

function Cell({
  label,
  value,
  warn,
  children,
}: {
  label: string;
  value?: number;
  warn?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-bg/85 px-4 py-3 min-w-0">
      <div className={warn ? "mono-label mb-2" : "mono-label-dim mb-2"}>{label}</div>
      {children ?? (
        <div className={`serif-display text-[1.8rem] leading-none tnum ${warn ? "text-accent" : ""}`}>{value}</div>
      )}
    </div>
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
      </Section>
      <Section title="Connected tools" hint="MCP servers, services and brain plugins this project relies on.">
        <TagInput
          value={project.tools}
          onChange={(tools) => patchProject({ tools })}
          suggestions={Array.from(new Set([...TOOL_PRESETS, ...suggestions.tools]))}
          placeholder="add tool…"
        />
      </Section>
      <Section title="Tags">
        <TagInput
          value={project.tags}
          onChange={(tags) => patchProject({ tags })}
          suggestions={suggestions.tags}
          placeholder="add tag…"
        />
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
          <InlineText
            multiline
            value={project.description}
            placeholder="Describe the project…"
            onSave={(description) => patchProject({ description })}
          />
        </div>
      </Section>
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

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
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

/** Markdown export plus a ready-to-paste brief for whichever agent picks up the work. */
function HandoffTab({ store }: { store: Store }) {
  const { project, tasks, milestones, entries } = store;
  const [agent, setAgent] = useState<string>(project.agents[0] ?? "");
  const markdown = renderProjectMarkdown({ project, milestones, tasks, entries });

  const brief = useMemo(() => {
    const mine = tasks.filter((t) => t.status !== "done" && (!agent || t.agent === agent));
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const path = (t: Task): string => {
      const parent = t.parent_id ? byId.get(t.parent_id) : null;
      return parent ? `${path(parent)} › ${t.title}` : t.title;
    };
    const decisions = entries.filter((e) => e.kind === "decision" && e.decision_status !== "rejected" && e.decision_status !== "superseded");
    return [
      `You're picking up work on **${project.name}**${project.owner && project.repo ? ` (${project.owner}/${project.repo})` : ""}.`,
      project.summary ? `\n${project.summary}` : "",
      project.next_action ? `\nNext action: ${project.next_action}` : "",
      `\n## Your open tasks${agent ? ` (@${agent})` : ""}`,
      ...(mine.length
        ? mine.map((t) => `- [ ] ${path(t)}${t.status !== "todo" ? ` (${t.status})` : ""}${t.due_date ? ` · due ${t.due_date}` : ""}${t.notes ? `\n  ${t.notes.replace(/\n/g, "\n  ")}` : ""}`)
        : ["- (none assigned)"]),
      decisions.length ? "\n## Decisions to respect" : "",
      ...decisions.map((d) => `- ${d.title}${d.body ? `: ${d.body}` : ""}`),
      project.tools.length ? `\nTools available: ${project.tools.join(", ")}` : "",
      "\nWhen you finish a task, say which one so it can be checked off, and summarise any decision you made and why.",
    ]
      .filter(Boolean)
      .join("\n");
  }, [agent, project, tasks, entries]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Section title="Agent brief" hint="Paste into a Claude session to hand off the open work.">
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className={`${inputCls} mb-3`}>
          <option value="">All open tasks</option>
          {store.agentOptions.map((a) => (
            <option key={a} value={a}>
              @{a}
            </option>
          ))}
        </select>
        <CopyBlock text={brief} />
      </Section>
      <Section title="PROJECT.md" hint="The whole project as Markdown. Commit it to the repo or paste it as context.">
        <div className="max-h-[36rem] overflow-y-auto">
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
  );
}
