"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  STATUSES,
  STATUS_META,
  fmtDate,
  isOverdue,
  relTime,
  today,
  type Project,
  type ProjectStatus,
  type ProjectSummary,
  type TimelineItem,
} from "@/lib/projectTypes";
import {
  Chip,
  PRIORITY_MARK,
  Progress,
  StatusDot,
  StatusToggle,
  api,
  btnGhost,
  btnPrimary,
  inputCls,
} from "@/components/ProjectBits";
import { GlyphPlus } from "@/components/Glyphs";

type View = "board" | "list" | "timeline";
type GhRepo = {
  owner: string;
  repo: string;
  description: string;
  pushed_at: string | null;
  fork: boolean;
  archived: boolean;
  private: boolean;
};

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export default function ProjectsClient({
  initialProjects,
  timeline,
}: {
  initialProjects: ProjectSummary[];
  timeline: TimelineItem[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [view, setView] = useState<View>("board");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [facet, setFacet] = useState("");
  const [panel, setPanel] = useState<"none" | "new" | "import">("none");
  const [flash, setFlash] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const facets = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects) {
      p.agents.forEach((a) => s.add(`agent:${a}`));
      p.tools.forEach((t) => s.add(`tool:${t}`));
      p.tags.forEach((t) => s.add(`tag:${t}`));
    }
    return Array.from(s).sort();
  }, [projects]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter((p) => statusFilter === "all" || p.status === statusFilter)
      .filter((p) => {
        if (!facet) return true;
        const [kind, val] = [facet.slice(0, facet.indexOf(":")), facet.slice(facet.indexOf(":") + 1)];
        const list = kind === "agent" ? p.agents : kind === "tool" ? p.tools : p.tags;
        return list.includes(val);
      })
      .filter(
        (p) =>
          !q ||
          [p.name, p.owner, p.repo, p.summary, p.next_action, ...p.tags]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
      )
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sort_order - b.sort_order);
  }, [projects, statusFilter, facet, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length };
    for (const s of STATUSES) c[s] = projects.filter((p) => p.status === s).length;
    return c;
  }, [projects]);

  const totals = useMemo(() => {
    const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    return {
      open: projects.reduce((n, p) => n + p.stats.total - p.stats.done, 0),
      doing: projects.reduce((n, p) => n + p.stats.doing, 0),
      blocked: projects.reduce((n, p) => n + p.stats.blocked, 0),
      overdue: projects.reduce((n, p) => n + p.stats.overdue, 0),
      dueSoon: timeline.filter((m) => !m.done && m.target_date && m.target_date >= today() && m.target_date <= soon).length,
    };
  }, [projects, timeline]);

  const setStatus = async (id: string, status: ProjectStatus) => {
    const prev = projects;
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await api(`/api/projects/${id}`, "PATCH", { status });
    } catch (err: unknown) {
      setProjects(prev);
      setFlash(`Could not change status: ${(err as Error).message}`);
    }
  };

  const added = (created: Project[], failed: Array<{ name: string; reason: string }>) => {
    setProjects((ps) => [
      ...created.map((p) => ({
        ...p,
        stats: { total: 0, done: 0, doing: 0, blocked: 0, overdue: 0, nextMilestone: null, lastActivity: p.created_at },
      })),
      ...ps,
    ]);
    setFlash(
      `Added ${created.length}` +
        (failed.length ? ` · skipped ${failed.length} (${failed.map((f) => `${f.name}: ${f.reason}`).join(", ")})` : "")
    );
    setPanel("none");
  };

  return (
    <div>
      {/* Pulse strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line border border-line mb-10">
        <Pulse label="In motion" value={counts.active + counts.building} sub="active + building" />
        <Pulse label="Open tasks" value={totals.open} sub={`${totals.doing} in progress`} />
        <Pulse label="Blocked" value={totals.blocked} warn={totals.blocked > 0} />
        <Pulse label="Overdue" value={totals.overdue} warn={totals.overdue > 0} />
        <Pulse label="Milestones · 14d" value={totals.dueSoon} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-stretch gap-px bg-line border border-line mb-6">
        {(["all", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-3 font-mono text-[0.62rem] tracking-[0.22em] uppercase flex items-center gap-2 ${
              statusFilter === s ? "bg-[rgba(139,115,85,0.08)] text-accent" : "bg-bg/70 text-fg-dim hover:text-fg"
            }`}
          >
            {s !== "all" ? <StatusDot status={s} /> : null}
            {s === "all" ? "All" : STATUS_META[s].label}
            <span className="tnum text-fg-ghost">{counts[s]}</span>
          </button>
        ))}
        <div className="flex-1 min-w-[10rem] bg-bg/70 flex items-center px-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search…"
            className="w-full bg-transparent outline-none font-mono text-xs text-fg placeholder:text-fg-ghost py-3"
          />
        </div>
        <select
          value={facet}
          onChange={(e) => setFacet(e.target.value)}
          className="bg-bg/70 font-mono text-[0.62rem] text-fg-dim px-3 outline-none"
        >
          <option value="">any agent / tool / tag</option>
          {facets.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="inline-flex gap-px bg-line border border-line">
          {(["board", "list", "timeline"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 font-mono text-[0.6rem] tracking-[0.22em] uppercase ${
                view === v ? "bg-fg text-bg" : "bg-bg/80 text-fg-dim hover:text-fg"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPanel(panel === "import" ? "none" : "import")} className={btnGhost}>
            Import from GitHub
          </button>
          <button
            onClick={() => setPanel(panel === "new" ? "none" : "new")}
            className={`${btnPrimary} flex items-center gap-2`}
          >
            <GlyphPlus size={11} /> New project
          </button>
        </div>
      </div>

      {flash ? (
        <div className="mb-6 font-mono text-xs text-accent flex justify-between">
          <span>{flash}</span>
          <button onClick={() => setFlash(null)} className="text-fg-ghost hover:text-fg">dismiss</button>
        </div>
      ) : null}

      {panel === "new" ? <NewProjectForm onDone={added} /> : null}
      {panel === "import" ? (
        <ImportPanel tracked={projects} onDone={added} />
      ) : null}

      {projects.length === 0 ? (
        <Empty
          title="No projects yet"
          body="Import your GitHub repos in one pass, or add a project by hand. Ideas without a repo are fine too."
        />
      ) : view === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUSES.filter((s) => statusFilter === "all" || s === statusFilter).map((s) => {
            const col = visible.filter((p) => p.status === s);
            return (
              <div
                key={s}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) setStatus(dragId, s);
                  setDragId(null);
                }}
                className={`min-h-[12rem] border border-dashed p-2 ${
                  dragId ? "border-accent-light bg-[rgba(139,115,85,0.04)]" : "border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 px-1 mb-3">
                  <StatusDot status={s} />
                  <span className="mono-label">{STATUS_META[s].label}</span>
                  <span className="font-mono text-[0.6rem] text-fg-ghost tnum">{col.length}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {col.map((p) => (
                    <ProjectCard
                      key={p.id}
                      p={p}
                      onStatus={(st) => setStatus(p.id, st)}
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => setDragId(null)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "list" ? (
        <ListView projects={visible} onStatus={setStatus} />
      ) : (
        <TimelineView
          items={timeline.filter((m) => visible.some((p) => p.id === m.project_id))}
          projects={visible}
        />
      )}
    </div>
  );
}

function Pulse({ label, value, sub, warn }: { label: string; value: number; sub?: string; warn?: boolean }) {
  return (
    <div className="bg-bg/85 p-5">
      <div className={warn ? "mono-label" : "mono-label-dim"}>{label}</div>
      <div className={`serif-display text-[2.4rem] leading-none mt-2 tnum ${warn ? "text-accent" : "text-fg"}`}>
        {value}
      </div>
      {sub ? <div className="font-mono text-[0.58rem] text-fg-ghost mt-2">{sub}</div> : null}
    </div>
  );
}

function ProjectCard({
  p,
  onStatus,
  onDragStart,
  onDragEnd,
}: {
  p: ProjectSummary;
  onStatus: (s: ProjectStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <Link
      href={`/projects/${p.id}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="accent-sweep block border border-line bg-bg/85 p-4 hover:bg-bg cursor-grab active:cursor-grabbing"
      style={{ transition: "background-color var(--motion-base) var(--ease-mythic)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="serif-display text-[1.3rem] leading-tight text-fg">{p.name}</div>
        <span className="font-mono text-[0.6rem] text-accent shrink-0" title={`${p.priority} priority`}>
          {PRIORITY_MARK[p.priority]}
        </span>
      </div>
      {p.owner && p.repo ? (
        <div className="font-mono text-[0.6rem] text-fg-ghost truncate mb-2">
          {p.owner}/{p.repo}
        </div>
      ) : null}
      {p.summary ? <p className="text-fg-dim text-[0.8rem] leading-[1.55] mb-3 line-clamp-2">{p.summary}</p> : null}
      {p.next_action ? (
        <div className="text-[0.78rem] leading-snug mb-3 border-l-2 border-accent pl-2">
          <span className="font-mono text-[0.55rem] tracking-[0.2em] uppercase text-accent block">Next</span>
          {p.next_action}
        </div>
      ) : null}
      <Progress done={p.stats.done} total={p.stats.total} />
      <div className="flex flex-wrap gap-1 mt-3">
        {p.stats.blocked ? <Chip tone="solid">{p.stats.blocked} blocked</Chip> : null}
        {p.stats.overdue ? <Chip tone="solid">{p.stats.overdue} overdue</Chip> : null}
        {p.agents.slice(0, 3).map((a) => (
          <Chip key={a} tone="accent">@{a}</Chip>
        ))}
        {p.tools.slice(0, 3).map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
      </div>
      {p.stats.nextMilestone ? (
        <div
          className={`font-mono text-[0.58rem] mt-3 truncate ${
            isOverdue(p.stats.nextMilestone.target_date, false) ? "text-accent" : "text-fg-ghost"
          }`}
        >
          ◇ {p.stats.nextMilestone.title}
          {p.stats.nextMilestone.target_date ? ` · ${fmtDate(p.stats.nextMilestone.target_date)}` : ""}
        </div>
      ) : null}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
        <StatusToggle value={p.status} onChange={onStatus} size="sm" />
        <span className="font-mono text-[0.55rem] text-fg-ghost">{relTime(p.stats.lastActivity)}</span>
      </div>
    </Link>
  );
}

function ListView({
  projects,
  onStatus,
}: {
  projects: ProjectSummary[];
  onStatus: (id: string, s: ProjectStatus) => void;
}) {
  return (
    <div className="border border-line bg-bg/85 overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line">
            {["Project", "Status", "Next action", "Progress", "Agents", "Target", "Updated"].map((h) => (
              <th key={h} className="mono-label-dim font-normal px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0 hover:bg-[rgba(139,115,85,0.04)]">
              <td className="px-4 py-3">
                <Link href={`/projects/${p.id}`} className="text-fg hover:text-accent">
                  <span className="font-mono text-[0.6rem] text-accent mr-2">{PRIORITY_MARK[p.priority]}</span>
                  {p.name}
                </Link>
                {p.repo ? <div className="font-mono text-[0.58rem] text-fg-ghost">{p.owner}/{p.repo}</div> : null}
              </td>
              <td className="px-4 py-3">
                <StatusToggle value={p.status} onChange={(s) => onStatus(p.id, s)} size="sm" />
              </td>
              <td className="px-4 py-3 text-[0.8rem] text-fg-dim max-w-[16rem]">{p.next_action || "—"}</td>
              <td className="px-4 py-3 w-36">
                <Progress done={p.stats.done} total={p.stats.total} />
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {p.agents.map((a) => (
                    <Chip key={a} tone="accent">@{a}</Chip>
                  ))}
                </div>
              </td>
              <td className={`px-4 py-3 font-mono text-[0.62rem] ${isOverdue(p.target_date, false) ? "text-accent" : "text-fg-dim"}`}>
                {fmtDate(p.target_date) || "—"}
              </td>
              <td className="px-4 py-3 font-mono text-[0.6rem] text-fg-ghost">{relTime(p.stats.lastActivity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineView({ items, projects }: { items: TimelineItem[]; projects: ProjectSummary[] }) {
  const targets = projects
    .filter((p) => p.target_date)
    .map((p) => ({ key: `p-${p.id}`, date: p.target_date!, kind: "launch" as const, p }));
  const rows = [
    ...items.map((m) => ({ key: m.id, date: m.target_date, kind: "milestone" as const, m })),
    ...targets,
  ].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  if (!rows.length) {
    return <Empty title="Nothing on the timeline" body="Add milestones with target dates inside a project, or set a project target date." />;
  }

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.date
      ? new Date(`${r.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "Unscheduled";
    groups.set(k, [...(groups.get(k) || []), r]);
  }

  return (
    <div className="flex flex-col gap-10">
      {Array.from(groups.entries()).map(([month, list]) => (
        <section key={month}>
          <div className="hairline-accent-sm mb-4">
            <span className="mono-label">{month}</span>
          </div>
          <ol className="relative border-l border-line ml-2">
            {list.map((r) => {
              const isMs = r.kind === "milestone";
              const done = isMs ? r.m.done : false;
              const late = isOverdue(r.date, done);
              const href = `/projects/${isMs ? r.m.project_id : r.p.id}`;
              return (
                <li key={r.key} className="pl-6 py-3 relative">
                  <span
                    className={`absolute -left-[5px] top-[1.15rem] h-[9px] w-[9px] rotate-45 border ${
                      done ? "bg-accent border-accent" : late ? "bg-fg border-fg" : "bg-bg border-accent"
                    }`}
                  />
                  <Link href={href} className="group flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-mono text-[0.62rem] text-fg-ghost w-24 shrink-0">
                      {fmtDate(r.date) || "no date"}
                    </span>
                    <span className={`text-[0.95rem] group-hover:text-accent ${done ? "line-through text-fg-ghost" : "text-fg"}`}>
                      {isMs ? r.m.title : `${r.p.name} target`}
                    </span>
                    <span className="font-mono text-[0.6rem] text-fg-dim flex items-center gap-1.5">
                      <StatusDot status={isMs ? r.m.project_status : r.p.status} />
                      {isMs ? r.m.project_name : "project launch"}
                    </span>
                    {isMs && r.m.tasks_total ? (
                      <span className="font-mono text-[0.6rem] text-fg-ghost tnum">
                        {r.m.tasks_done}/{r.m.tasks_total} tasks
                      </span>
                    ) : null}
                    {late ? <Chip tone="solid">overdue</Chip> : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function NewProjectForm({
  onDone,
}: {
  onDone: (c: Project[], f: Array<{ name: string; reason: string }>) => void;
}) {
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const cleaned = repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
    const [owner, r] = cleaned.split("/").filter(Boolean);
    if (cleaned && !r) return setErr("Repo should look like owner/repo");
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ created: Project[]; failed: Array<{ name: string; reason: string }> }>(
        "/api/projects",
        "POST",
        { name: name.trim() || r, owner: owner || null, repo: r || null, summary, status }
      );
      if (!res.created.length) setErr(res.failed[0]?.reason || "Not created");
      else onDone(res.created, res.failed);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-line bg-bg-warm/80 p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the repo name" className={inputCls} />
      </Field>
      <Field label="GitHub repo (optional)">
        <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" className={inputCls} />
      </Field>
      <Field label="One-line summary">
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What is it, in a sentence?" className={inputCls} />
      </Field>
      <Field label="Status">
        <StatusToggle value={status} onChange={setStatus} />
      </Field>
      <div className="md:col-span-2 flex items-center justify-between">
        <span className="font-mono text-[0.6rem] text-fg-ghost">
          Agents, tools, links and the plan live on the project page.
        </span>
        <div className="flex items-center gap-3">
          {err ? <span className="font-mono text-xs text-accent">{err}</span> : null}
          <button onClick={submit} disabled={busy || (!name.trim() && !repo.trim())} className={btnPrimary}>
            {busy ? "Adding…" : "Add project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPanel({
  tracked,
  onDone,
}: {
  tracked: Project[];
  onDone: (c: Project[], f: Array<{ name: string; reason: string }>) => void;
}) {
  const [repos, setRepos] = useState<GhRepo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [hideForks, setHideForks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const have = new Set(tracked.filter((p) => p.repo).map((p) => `${p.owner}/${p.repo}`.toLowerCase()));
  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<{ repos: GhRepo[] }>("/api/github/repos", "GET");
      setRepos(res.repos);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Recently pushed → active; archived → paused; else planned. Easy to flip after.
  const guessStatus = (r: GhRepo): ProjectStatus => {
    if (r.archived) return "paused";
    if (r.pushed_at && Date.now() - new Date(r.pushed_at).getTime() < 21 * 86_400_000) return "active";
    return "planned";
  };

  const list = (repos || []).filter((r) => !(hideForks && r.fork));
  const key = (r: GhRepo) => `${r.owner}/${r.repo}`;

  const submit = async () => {
    setBusy(true);
    try {
      const items = list
        .filter((r) => picked.has(key(r)))
        .map((r) => ({ name: r.repo, owner: r.owner, repo: r.repo, summary: r.description, status: guessStatus(r) }));
      const res = await api<{ created: Project[]; failed: Array<{ name: string; reason: string }> }>(
        "/api/projects",
        "POST",
        { items }
      );
      onDone(res.created, res.failed);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-line bg-bg-warm/80 p-6 mb-8">
      {!repos ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-fg-dim text-sm">
            Lists every repo your GitHub token can read. Recently pushed repos start as Active,
            archived ones as Paused, the rest as Planned.
          </p>
          <button onClick={load} disabled={loading} className={btnPrimary}>
            {loading ? "Loading…" : "Load repos"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                className={btnGhost}
                onClick={() =>
                  setPicked(new Set(list.filter((r) => !have.has(key(r).toLowerCase())).map(key)))
                }
              >
                Select all new
              </button>
              <button className={btnGhost} onClick={() => setPicked(new Set())}>
                Clear
              </button>
              <label className="font-mono text-[0.6rem] text-fg-dim flex items-center gap-2">
                <input type="checkbox" checked={hideForks} onChange={(e) => setHideForks(e.target.checked)} />
                hide forks
              </label>
            </div>
            <button onClick={submit} disabled={busy || !picked.size} className={btnPrimary}>
              {busy ? "Importing…" : `Import ${picked.size}`}
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto border border-line bg-bg/70 divide-y divide-[rgba(26,24,20,0.06)]">
            {list.map((r) => {
              const k = key(r);
              const already = have.has(k.toLowerCase());
              return (
                <label
                  key={k}
                  className={`flex items-center gap-3 px-3 py-2 ${already ? "opacity-40" : "cursor-pointer hover:bg-[rgba(139,115,85,0.05)]"}`}
                >
                  <input
                    type="checkbox"
                    disabled={already}
                    checked={picked.has(k)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(k);
                      else next.delete(k);
                      setPicked(next);
                    }}
                  />
                  <span className="font-mono text-xs text-fg w-64 truncate">
                    <span className="text-fg-ghost">{r.owner}/</span>
                    {r.repo}
                  </span>
                  <span className="text-[0.75rem] text-fg-dim flex-1 truncate">{r.description}</span>
                  <span className="font-mono text-[0.58rem] text-fg-ghost w-28 text-right">
                    {already ? "tracked" : `${STATUS_META[guessStatus(r)].label} · ${relTime(r.pushed_at)}`}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
      {err ? <div className="mt-3 font-mono text-xs text-accent">{err}</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mono-label-dim block mb-2">{label}</span>
      {children}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-line bg-bg-warm/40 py-16 px-8 text-center">
      <div className="serif-display text-2xl text-fg mb-3">{title}</div>
      <p className="text-fg-dim text-sm max-w-md mx-auto leading-relaxed">{body}</p>
    </div>
  );
}
