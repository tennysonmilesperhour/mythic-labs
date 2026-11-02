"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CHANGE_TYPES,
  DECISION_STATUSES,
  fmtDate,
  today,
  type ChangeType,
  type DecisionStatus,
  type Entry,
} from "@/lib/projectTypes";
import { Chip, InlineText, api, btnGhost, btnPrimary, inputBase, inputCls } from "@/components/ProjectBits";
import { EditableMarkdown } from "@/components/Markdown";
import { GlyphClose } from "@/components/Glyphs";
import { HEALTH_LEVELS, HEALTH_META, type HealthLevel } from "@/lib/projectTypes";
import { ME, facetHref, githubRepoUrl, projectHref, taskHref } from "@/lib/taskMap";
import { Section, type Store } from "./ProjectDetailClient";

function useEntries(store: Store) {
  const { project, setEntries, fail } = store;
  const add = async (items: Partial<Entry>[]) => {
    const res = await api<{ created: Entry[]; skipped: number }>(
      `/api/projects/${project.id}/entries`,
      "POST",
      { items }
    );
    setEntries((es) =>
      [...res.created, ...es].sort(
        (a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at)
      )
    );
    return res;
  };
  const patch = async (id: string, p: Partial<Entry>) => {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e)));
    await api(`/api/entries/${id}`, "PATCH", p).catch((e: Error) => fail(e.message));
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    setEntries((es) => es.filter((e) => e.id !== id));
    await api(`/api/entries/${id}`, "DELETE").catch((e: Error) => fail(e.message));
  };
  return { add, patch, remove };
}

// ─────────── Changelog ───────────

type GhActivity = {
  html_url: string;
  open_issues: number;
  pushed_at: string;
  latest_release: { tag: string; url: string; published_at: string | null } | null;
  merged_pulls: Array<{ number: number; title: string; url: string; merged_at: string; body: string }>;
  commits: Array<{ sha: string; title: string; url: string; date: string | null }>;
};

function guessType(title: string): ChangeType {
  const t = title.toLowerCase();
  if (/secur|cve|vuln/.test(t)) return "security";
  if (/^(fix|bug)|\bfix(es|ed)?\b/.test(t)) return "fixed";
  if (/^(feat|add)|\badd(s|ed)?\b|\bnew\b/.test(t)) return "added";
  if (/remov|delet|drop|retire/.test(t)) return "removed";
  return "changed";
}

export function ChangelogTab({ store }: { store: Store }) {
  const { entries, project, fail } = store;
  const { add, patch, remove } = useEntries(store);
  const [form, setForm] = useState({ title: "", body: "", version: "", change_type: "added" as ChangeType, entry_date: today() });
  const [gh, setGh] = useState<GhActivity | null>(null);
  const [ghBusy, setGhBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const list = entries.filter((e) => e.kind === "changelog");
  const imported = new Set(list.map((e) => e.source_url).filter(Boolean));
  const groups = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of list) {
      const k = e.version ? `v${e.version.replace(/^v/, "")}` : fmtDate(e.entry_date);
      m.set(k, [...(m.get(k) || []), e]);
    }
    return Array.from(m.entries());
  }, [list]);

  const submit = async () => {
    if (!form.title.trim()) return;
    try {
      await add([{ ...form, kind: "changelog", version: form.version.trim() || null }]);
      setForm({ ...form, title: "", body: "" });
    } catch (e: unknown) {
      fail((e as Error).message);
    }
  };

  const loadGh = async () => {
    setGhBusy(true);
    try {
      setGh(await api<GhActivity>(`/api/projects/${project.id}/github`, "GET"));
    } catch (e: unknown) {
      fail((e as Error).message);
    } finally {
      setGhBusy(false);
    }
  };

  const importPicked = async () => {
    if (!gh) return;
    const items: Partial<Entry>[] = [
      ...gh.merged_pulls
        .filter((p) => picked.has(p.url))
        .map((p) => ({
          kind: "changelog" as const,
          title: p.title,
          body: `#${p.number}`,
          entry_date: p.merged_at.slice(0, 10),
          change_type: guessType(p.title),
          source_url: p.url,
        })),
      ...gh.commits
        .filter((c) => picked.has(c.url))
        .map((c) => ({
          kind: "changelog" as const,
          title: c.title,
          body: c.sha,
          entry_date: (c.date || today()).slice(0, 10),
          change_type: guessType(c.title),
          source_url: c.url,
        })),
    ];
    try {
      const res = await add(items);
      setPicked(new Set());
      if (res.skipped) fail(`${res.skipped} already imported, skipped`);
    } catch (e: unknown) {
      fail((e as Error).message);
    }
  };

  const pick = (url: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(url);
      else n.delete(url);
      return n;
    });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-10">
      <div>
        {groups.length === 0 ? (
          <p className="text-fg-ghost text-sm">No changes logged yet. Add one, or import merged PRs from GitHub.</p>
        ) : (
          groups.map(([label, items]) => (
            <section key={label} className="mb-8">
              <div className="hairline-accent-sm mb-3">
                {label.startsWith("v") && project.owner && project.repo ? (
                  <a
                    href={githubRepoUrl(project.owner, project.repo, "/releases")}
                    target="_blank"
                    rel="noreferrer"
                    className="mono-label hover:text-fg"
                    title="Releases on GitHub"
                  >
                    {label} ↗
                  </a>
                ) : (
                  <span className="mono-label">{label}</span>
                )}
              </div>
              <ul className="flex flex-col">
                {items.map((e) => (
                  <li key={e.id} id={`entry-${e.id}`} className="group flex items-baseline gap-3 py-2 border-b border-line scroll-mt-24">
                    <select
                      value={e.change_type ?? "changed"}
                      onChange={(ev) => patch(e.id, { change_type: ev.target.value as ChangeType })}
                      className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-accent bg-transparent outline-none w-20 shrink-0"
                    >
                      {CHANGE_TYPES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.92rem]">
                        <InlineText value={e.title} onSave={(title) => title && patch(e.id, { title })} />
                      </div>
                      <div className="text-fg-dim text-[0.8rem]">
                        <InlineText value={e.body} placeholder="details…" onSave={(body) => patch(e.id, { body })} />
                      </div>
                    </div>
                    <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0">{fmtDate(e.entry_date)}</span>
                    {e.source_url && !e.source_url.startsWith("mythic-import://") ? (
                      <a href={e.source_url} target="_blank" rel="noreferrer" className="font-mono text-[0.58rem] text-fg-ghost hover:text-accent" title={e.source_url}>
                        {e.body && /^(#\d+|[0-9a-f]{7,40})$/.test(e.body.trim()) ? `${e.body.trim().slice(0, 9)} ↗` : "↗"}
                      </a>
                    ) : null}
                    {e.evidence_url ? (
                      <a href={e.evidence_url} target="_blank" rel="noreferrer" className="font-mono text-[0.58rem] text-fg-ghost hover:text-accent" aria-label="Open evidence source" title="Evidence source">
                        SOURCE ↗
                      </a>
                    ) : null}
                    <button onClick={() => remove(e.id)} className="text-fg-ghost hover:text-fg opacity-0 group-hover:opacity-100">
                      <GlyphClose size={10} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="flex flex-col gap-8">
        <Section title="Log a change">
          <div className="flex flex-col gap-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What changed" className={inputCls} />
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Details (optional)" rows={2} className={inputCls} />
            <div className="flex gap-2">
              <select value={form.change_type} onChange={(e) => setForm({ ...form, change_type: e.target.value as ChangeType })} className={inputCls}>
                {CHANGE_TYPES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="version" className={inputCls} />
            </div>
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} className={inputCls} />
            <button onClick={submit} disabled={!form.title.trim()} className={btnPrimary}>
              Add to changelog
            </button>
          </div>
        </Section>

        <Section title="From GitHub" hint="Read-only. Pick merged PRs or commits to log.">
          {!project.repo ? (
            <p className="text-fg-ghost text-xs">Link a repo in Setup first.</p>
          ) : !gh ? (
            <button onClick={loadGh} disabled={ghBusy} className={btnGhost}>
              {ghBusy ? "Loading…" : "Load recent activity"}
            </button>
          ) : (
            <div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {project.owner && project.repo ? (
                  <a href={githubRepoUrl(project.owner, project.repo, "/issues")} target="_blank" rel="noreferrer">
                    <Chip>{gh.open_issues} open issues/PRs ↗</Chip>
                  </a>
                ) : (
                  <Chip>{gh.open_issues} open issues/PRs</Chip>
                )}
                {gh.latest_release ? (
                  <a href={gh.latest_release.url} target="_blank" rel="noreferrer">
                    <Chip tone="accent">release {gh.latest_release.tag}</Chip>
                  </a>
                ) : null}
              </div>
              <div className="max-h-96 overflow-y-auto border border-line bg-bg/70">
                <GhList
                  title="Merged PRs"
                  rows={gh.merged_pulls.map((p) => ({ url: p.url, title: `#${p.number} ${p.title}`, date: p.merged_at }))}
                  imported={imported}
                  picked={picked}
                  onPick={pick}
                />
                <GhList
                  title="Commits"
                  rows={gh.commits.map((c) => ({ url: c.url, title: c.title, date: c.date }))}
                  imported={imported}
                  picked={picked}
                  onPick={pick}
                />
              </div>
              <button onClick={importPicked} disabled={!picked.size} className={`${btnPrimary} mt-3 w-full`}>
                Import {picked.size}
              </button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function GhList({
  title,
  rows,
  imported,
  picked,
  onPick,
}: {
  title: string;
  rows: Array<{ url: string; title: string; date: string | null }>;
  imported: Set<string | null>;
  picked: Set<string>;
  onPick: (url: string, on: boolean) => void;
}) {
  return (
    <div>
      <div className="mono-label-dim px-3 pt-3 pb-1">{title}</div>
      {rows.length === 0 ? <div className="px-3 pb-2 text-xs text-fg-ghost">none</div> : null}
      {rows.map((r) => {
        const done = imported.has(r.url);
        return (
          <label key={r.url} className={`flex items-start gap-2 px-3 py-1.5 text-[0.78rem] ${done ? "opacity-40" : "cursor-pointer hover:bg-[rgba(139,115,85,0.05)]"}`}>
            <input type="checkbox" disabled={done} checked={picked.has(r.url)} onChange={(e) => onPick(r.url, e.target.checked)} className="mt-1" />
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 hover:text-accent"
              title="Open on GitHub"
            >
              {r.title}
            </a>
            <span className="font-mono text-[0.55rem] text-fg-ghost shrink-0">{fmtDate(r.date)}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─────────── Decisions ───────────

const DECISION_TONE: Record<DecisionStatus, "accent" | "dim" | "solid"> = {
  proposed: "dim",
  accepted: "accent",
  superseded: "dim",
  rejected: "dim",
};

/** An entry's source (PR, commit, doc); import keys aren't URLs and stay hidden. */
function SourceLink({ href }: { href: string | null | undefined }) {
  return href && /^https?:\/\//.test(href) ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-block mt-2 mr-4 font-mono text-[0.58rem] text-fg-ghost hover:text-accent">
      SOURCE ↗
    </a>
  ) : null;
}

function EvidenceSource({ href }: { href: string | null | undefined }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-block mt-2 font-mono text-[0.58rem] text-fg-ghost hover:text-accent">
      EVIDENCE SOURCE ↗
    </a>
  ) : null;
}

export function DecisionsTab({ store }: { store: Store }) {
  const { add, patch, remove } = useEntries(store);
  const blank = {
    title: "",
    context: "",
    body: "",
    alternatives: "",
    consequences: "",
    decision_status: "accepted" as DecisionStatus,
    entry_date: today(),
  };
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const list = store.entries.filter((e) => e.kind === "decision");
  const ordered = [...list.filter((e) => e.decision_status === "proposed"), ...list.filter((e) => e.decision_status !== "proposed")];

  const submit = async () => {
    try {
      await add([{ ...form, kind: "decision" }]);
      setForm(blank);
      setShowForm(false);
    } catch (e: unknown) {
      store.fail((e as Error).message);
    }
  };

  const fields: Array<[keyof typeof blank, string, string]> = [
    ["context", "Context", "What forced the decision?"],
    ["body", "Decision", "What did you decide?"],
    ["alternatives", "Alternatives", "What else was on the table, and why not?"],
    ["consequences", "Consequences", "What does this commit you to? What gets harder?"],
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-fg-dim text-sm max-w-xl">
          A record of why things are the way they are. Future you, and any agent picking this up, reads this first.
        </p>
        <button onClick={() => setShowForm((v) => !v)} className={btnPrimary}>
          {showForm ? "Close" : "Record decision"}
        </button>
      </div>

      {showForm ? (
        <div className="border border-line bg-bg-warm/80 p-5 mb-8 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Decision title, e.g. Use Supabase for auth"
            className={`${inputCls} md:col-span-2`}
          />
          {fields.map(([k, label, ph]) => (
            <label key={k} className="block">
              <span className="mono-label-dim block mb-1">{label}</span>
              <textarea value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={ph} rows={3} className={inputCls} />
            </label>
          ))}
          <div className="md:col-span-2 flex gap-2 justify-end">
            <select value={form.decision_status} onChange={(e) => setForm({ ...form, decision_status: e.target.value as DecisionStatus })} className={`${inputBase} w-40`}>
              {DECISION_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} className={`${inputBase} w-40`} />
            <button onClick={submit} disabled={!form.title.trim()} className={btnPrimary}>
              Save
            </button>
          </div>
        </div>
      ) : null}

      {list.length === 0 && !showForm ? <p className="text-fg-ghost text-sm">No decisions recorded yet.</p> : null}

      <div className="flex flex-col gap-4">
        {ordered.map((e) => (
          <article key={e.id} id={`entry-${e.id}`} className={`scroll-mt-24 group border border-line bg-bg/85 p-5 ${e.decision_status === "superseded" || e.decision_status === "rejected" ? "opacity-60" : ""}`}>
            <div className="flex items-baseline gap-3 mb-3">
              <Link
                href={projectHref(store.project.id, "decisions", e.id)}
                className="font-mono text-[0.58rem] text-fg-ghost hover:text-accent"
                title="Permalink to this decision"
              >
                ADR-{String(list.length - list.indexOf(e)).padStart(3, "0")}
              </Link>
              <h3 className="serif-display text-[1.4rem] leading-tight flex-1">
                <InlineText value={e.title} onSave={(title) => title && patch(e.id, { title })} />
              </h3>
              <Chip tone={DECISION_TONE[e.decision_status ?? "accepted"]}>
                <select
                  value={e.decision_status ?? "accepted"}
                  onChange={(ev) => patch(e.id, { decision_status: ev.target.value as DecisionStatus })}
                  className="bg-transparent outline-none uppercase"
                >
                  {DECISION_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Chip>
              <span className="font-mono text-[0.58rem] text-fg-ghost">
                {e.author ? (
                  <>
                    <Link href={facetHref("agent", e.author)} className="hover:text-accent">
                      @{e.author}
                    </Link>
                    {" · "}
                  </>
                ) : null}
                {fmtDate(e.entry_date)}
              </span>
              <button onClick={() => remove(e.id)} className="text-fg-ghost hover:text-fg opacity-0 group-hover:opacity-100">
                <GlyphClose size={10} />
              </button>
            </div>
            {e.decision_status === "proposed" ? (
              <div className="flex items-center gap-2 mb-4 border border-accent bg-[rgba(139,115,85,0.05)] px-3 py-2">
                <span className="mono-label flex-1">Waiting on your call</span>
                <button className={btnPrimary} onClick={() => patch(e.id, { decision_status: "accepted" })}>
                  Accept
                </button>
                <button className={btnGhost} onClick={() => patch(e.id, { decision_status: "rejected" })}>
                  Reject
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {fields.map(([k, label]) => (
                <div key={k}>
                  <div className="mono-label-dim mb-1">{label}</div>
                  <div className="text-[0.85rem] text-fg-dim leading-[1.6]">
                    <EditableMarkdown value={String(e[k as keyof Entry] ?? "")} placeholder="not written" onSave={(v) => patch(e.id, { [k]: v })} />
                  </div>
                </div>
              ))}
            </div>
            <SourceLink href={e.source_url} />
            <EvidenceSource href={e.evidence_url} />
          </article>
        ))}
      </div>
    </div>
  );
}

// ─────────── Notes ───────────

export function NotesTab({ store }: { store: Store }) {
  const { add, patch, remove } = useEntries(store);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const list = store.entries.filter((e) => e.kind === "note");

  const submit = async () => {
    try {
      await add([{ kind: "note", title: title.trim(), body, entry_date: today() }]);
      setTitle("");
      setBody("");
    } catch (e: unknown) {
      store.fail((e as Error).message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
        {list.length === 0 ? <p className="text-fg-ghost text-sm">Ideas, research, loose ends. Nothing here yet.</p> : null}
        {list.map((e) => (
          <div key={e.id} id={`entry-${e.id}`} className="group border border-line bg-bg/85 p-4 scroll-mt-24">
            <div className="flex items-baseline gap-2 mb-2">
              <div className="text-fg flex-1">
                <InlineText value={e.title} onSave={(t) => t && patch(e.id, { title: t })} />
              </div>
              <Link
                href={projectHref(store.project.id, "notes", e.id)}
                className="font-mono text-[0.55rem] text-fg-ghost hover:text-accent"
                title="Permalink to this note"
              >
                {fmtDate(e.entry_date)}
              </Link>
              <button onClick={() => remove(e.id)} className="text-fg-ghost hover:text-fg opacity-0 group-hover:opacity-100">
                <GlyphClose size={10} />
              </button>
            </div>
            <div className="text-[0.82rem] text-fg-dim leading-[1.6]">
              <EditableMarkdown value={e.body} placeholder="…" onSave={(b) => patch(e.id, { body: b })} />
            </div>
            <SourceLink href={e.source_url} />
            <EvidenceSource href={e.evidence_url} />
          </div>
        ))}
      </div>
      <Section title="New note">
        <div className="flex flex-col gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputCls} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write anything…" rows={6} className={inputCls} />
          <button onClick={submit} disabled={!title.trim()} className={btnPrimary}>
            Save note
          </button>
        </div>
      </Section>
    </div>
  );
}

// ─────────── Activity ───────────

/** Write a status update: a health call plus a few lines, the way a lead reports upward. */
function UpdateForm({ store }: { store: Store }) {
  const { add } = useEntries(store);
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<HealthLevel>("on_track");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await add([{ kind: "update", title: `Update ${today()}`, body: body.trim(), health, entry_date: today(), author: ME }]);
      setBody("");
      setOpen(false);
    } catch (e: unknown) {
      store.fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${btnGhost} mb-6`}>
        Post a status update
      </button>
    );
  }
  return (
    <div className="border border-line bg-bg-warm/80 p-4 mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {HEALTH_LEVELS.filter((h) => h !== "paused" && h !== "idle").map((h) => (
          <button key={h} onClick={() => setHealth(h)} className={`font-mono text-[0.6rem] uppercase tracking-[0.15em] px-2 py-1 border ${health === h ? "bg-fg text-bg border-fg" : "border-line text-fg-dim hover:text-fg"}`}>
            {HEALTH_META[h].label}
          </button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What happened, what is next, what is in the way. Markdown works." className={inputCls} />
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy || !body.trim()} className={btnPrimary}>Post update</button>
        <button onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

export function ActivityTab({ store }: { store: Store }) {
  const { entries, tasks, milestones, project } = store;
  const feed = useMemo(() => {
    // Each row carries where it leads: the entry, the task map or the plan.
    const tab: Partial<Record<Entry["kind"], string>> = { changelog: "changelog", decision: "decisions", note: "notes" };
    const rows: Array<{ at: string; kind: string; text: string; who: string | null; href: string | null; body?: string }> = [
      { at: project.created_at, kind: "created", text: "Project created", who: null, href: projectHref(project.id, "setup") },
      ...entries.map((e) => ({
        at: e.created_at,
        kind: e.kind === "update" && e.health ? HEALTH_META[e.health].label.toLowerCase() : e.kind,
        who: e.author,
        text:
          (e.kind === "status" ? `Status ${e.title}` : e.title) +
          (e.body && (e.kind === "status" || e.kind === "progress") && e.body !== e.title ? `: ${e.body}` : ""),
        body: e.kind === "update" ? e.body : undefined,
        href: tab[e.kind] ? projectHref(project.id, tab[e.kind], e.id) : e.task_id ? taskHref(e.task_id) : null,
      })),
      ...tasks.filter((t) => t.done_at).map((t) => ({ at: t.done_at!, kind: "done", text: t.title, who: t.agent, href: taskHref(t.id) })),
      ...milestones
        .filter((m) => m.done_at)
        .map((m) => ({ at: m.done_at!, kind: "milestone", text: `Milestone reached: ${m.title}`, who: null, href: projectHref(project.id, "plan") })),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [entries, tasks, milestones, project.created_at, project.id]);

  return (
    <>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
      <UpdateForm store={store} />
      <Link href={`/history?project=${project.id}`} className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-accent hover:text-fg mb-6" title="Every commit that touched this project, with preview and restore">
        Versions and restore →
      </Link>
    </div>
    <ol className="relative border-l border-line ml-2">
      {feed.map((r, i) => (
        <li key={i} className="pl-6 py-2 relative flex items-baseline gap-4">
          <span className={`absolute -left-[4px] top-[0.85rem] h-[7px] w-[7px] rounded-full ${r.kind === "status" || r.kind === "milestone" ? "bg-accent" : "bg-fg-ghost"}`} />
          <span className="font-mono text-[0.58rem] text-fg-ghost w-28 shrink-0" title={new Date(r.at).toLocaleString()}>
            {fmtDate(r.at)}
          </span>
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-accent w-20 shrink-0">{r.kind}</span>
          <span className="text-[0.88rem] text-fg min-w-0">
            {r.who ? (
              <>
                {r.who === ME ? `@${r.who}` : (
                  <Link href={facetHref("agent", r.who)} className="hover:text-accent">
                    @{r.who}
                  </Link>
                )}
                {" · "}
              </>
            ) : null}
            {r.href ? (
              <Link href={r.href} className="hover:text-accent">
                {r.text}
              </Link>
            ) : (
              r.text
            )}
            {r.body ? <span className="block text-[0.82rem] text-fg-dim mt-0.5 whitespace-pre-wrap">{r.body}</span> : null}
          </span>
        </li>
      ))}
    </ol>
    </>
  );
}
