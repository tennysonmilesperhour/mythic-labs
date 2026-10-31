"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { githubBlobUrl, githubRepoUrl, projectHref } from "@/lib/taskMap";
import type { Repo } from "@/lib/db";
import type { Marketplace } from "@/lib/brain";
import { renderSettingsJson } from "@/lib/settings";
import {
  GlyphApplied,
  GlyphClose,
  GlyphFork,
  GlyphPending,
  GlyphPlus,
} from "@/components/Glyphs";

type Filter = "all" | "owned" | "forked";

type CheckState =
  | { kind: "checking" }
  | { kind: "matches"; text: string }
  | { kind: "drift"; text: string }
  | { kind: "default"; text: string }
  | { kind: "error"; text: string }
  | { kind: "copied"; text: string };

type VerifyResponse = {
  ok?: boolean;
  reason?: string;
  enabled?: string[];
  error?: string;
};

type Props = {
  initialRepos: Repo[];
  marketplace: Marketplace | null;
  brainRepo: string;
  initialPluginState: Record<string, Record<string, boolean>>;
  /** Lowercased owner/repo → project id. */
  projectByRepo?: Record<string, string>;
};

export default function ReposClient({
  initialRepos,
  marketplace,
  brainRepo,
  initialPluginState,
  projectByRepo = {},
}: Props) {
  const [repos, setRepos] = useState<Repo[]>(initialRepos);
  const [pluginState, setPluginState] = useState(initialPluginState);
  const [input, setInput] = useState("");
  const [busy, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, CheckState>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const stale = repos.some((r) => r.is_fork === null);
    if (!stale) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/repos/backfill-meta", { method: "POST" });
        if (cancelled) return;
        const r2 = await fetch("/api/repos").then((r) => r.json());
        if (!cancelled && r2.repos) setRepos(r2.repos);
      } catch {
        /* best effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repos.filter((r) => {
      if (q && !`${r.owner}/${r.repo}`.toLowerCase().includes(q)) return false;
      if (filter === "owned" && r.is_fork === true) return false;
      if (filter === "forked" && r.is_fork !== true) return false;
      return true;
    });
  }, [repos, filter, search]);

  const counts = useMemo(
    () => ({
      all: repos.length,
      owned: repos.filter((r) => r.is_fork !== true).length,
      forked: repos.filter((r) => r.is_fork === true).length,
    }),
    [repos]
  );

  const addRepos = () => {
    if (!input.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const json = await res.json();
      if (json.error) {
        setFlash(`Error: ${json.error}`);
        return;
      }
      const created = json.created?.length || 0;
      const failed = json.failed?.length || 0;
      setFlash(`Added ${created} · failed ${failed}`);
      setInput("");
      const r2 = await fetch("/api/repos").then((r) => r.json());
      setRepos(r2.repos || []);
    });
  };

  const togglePlugin = async (
    repoId: string,
    slug: string,
    enabled: boolean
  ) => {
    setPluginState((s) => ({
      ...s,
      [repoId]: { ...(s[repoId] || {}), [slug]: enabled },
    }));
    await fetch(`/api/repos/${repoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, enabled }),
    });
  };

  const wantedFor = (repoId: string) => {
    const enabled: Record<string, boolean> = {};
    for (const p of marketplace?.plugins || []) {
      enabled[p.name] = pluginState[repoId]?.[p.name] ?? false;
    }
    return enabled;
  };

  const checkRepo = async (repo: Repo) => {
    setStatus((s) => ({ ...s, [repo.id]: { kind: "checking" } }));
    try {
      const res = await fetch(
        `/api/verify/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
      );
      const json = (await res.json()) as VerifyResponse;
      setStatus((s) => ({ ...s, [repo.id]: readVerify(json, wantedFor(repo.id)) }));
    } catch (err: unknown) {
      setStatus((s) => ({
        ...s,
        [repo.id]: { kind: "error", text: (err as Error).message },
      }));
    }
  };

  const copySnippet = async (repoId: string) => {
    if (!marketplace) return;
    const json = renderSettingsJson(brainRepo, marketplace.name, wantedFor(repoId));
    try {
      await navigator.clipboard.writeText(json);
      setStatus((s) => ({
        ...s,
        [repoId]: { kind: "copied", text: "copied · paste into .claude/settings.json" },
      }));
    } catch {
      setStatus((s) => ({
        ...s,
        [repoId]: { kind: "error", text: "clipboard blocked by the browser" },
      }));
    }
  };

  const removeRepo = async (repoId: string) => {
    if (!confirm("Remove this repo from the dashboard? (does not touch GitHub)"))
      return;
    await fetch(`/api/repos/${repoId}`, { method: "DELETE" });
    setRepos((rs) => rs.filter((r) => r.id !== repoId));
  };

  return (
    <div>
      <div className="flex items-stretch gap-px bg-line border border-line mb-6">
        <FilterChip label="All" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChip label="Owned" count={counts.owned} active={filter === "owned"} onClick={() => setFilter("owned")} />
        <FilterChip label="Forked" count={counts.forked} active={filter === "forked"} onClick={() => setFilter("forked")} />
        <div className="flex-1 bg-bg/70 flex items-center px-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search by name…"
            className="w-full bg-transparent border-0 outline-none font-mono text-xs text-fg placeholder:text-fg-ghost py-3"
          />
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="lift-on-hover flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.25em] uppercase px-5 py-3 bg-fg text-bg"
        >
          {showAdd ? "Close" : (
            <>
              <GlyphPlus size={12} /> Add
            </>
          )}
        </button>
      </div>

      {showAdd ? (
        <div className="border border-line bg-bg-warm/80 p-6 mb-6">
          <div className="mono-label mb-4">Paste repos</div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder={"owner/repo\nhttps://github.com/owner/another-repo\n…"}
            className="w-full bg-bg/70 border border-line p-3 font-mono text-sm leading-relaxed text-fg placeholder:text-fg-ghost focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] transition"
            style={{ transition: "border-color var(--motion-base) var(--ease-mythic), box-shadow var(--motion-base) var(--ease-mythic)" }}
          />
          <div className="flex items-center justify-between mt-3">
            <div className="font-mono text-xs text-fg-ghost">
              One per line · {input.split("\n").filter((l) => l.trim()).length}{" "}
              lines · fork status auto-detected
            </div>
            <button
              onClick={addRepos}
              disabled={busy || !input.trim()}
              className="lift-on-hover font-mono text-[0.65rem] tracking-[0.25em] uppercase px-6 py-2.5 bg-accent text-bg disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
          {flash ? (
            <div className="mt-3 font-mono text-xs text-accent">{flash}</div>
          ) : null}
        </div>
      ) : null}

      {repos.length === 0 ? (
        <EmptyState
          title="No exceptions tracked yet"
          body="Most repos need nothing here because they inherit your user or organization default. Add a repo only when it needs a different plugin set."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing matches this filter"
          body="Try a different chip or clear the search to widen the view."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <RepoCard
              key={r.id}
              repo={r}
              marketplace={marketplace}
              pluginState={pluginState[r.id] || {}}
              status={status[r.id]}
              projectId={projectByRepo[`${r.owner}/${r.repo}`.toLowerCase()]}
              onToggle={(slug, enabled) => togglePlugin(r.id, slug, enabled)}
              onCheck={() => checkRepo(r)}
              onCopy={() => copySnippet(r.id)}
              onRemove={() => removeRepo(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function readVerify(
  json: VerifyResponse,
  wanted: Record<string, boolean>
): CheckState {
  if (json.error) return { kind: "error", text: json.error };
  if (json.reason === "missing") {
    return { kind: "default", text: "no repo file · uses your default" };
  }
  if (json.reason === "invalid_json") {
    return { kind: "error", text: "repo settings.json is not valid JSON" };
  }
  if (!json.ok) {
    return { kind: "drift", text: "repo file doesn't declare the brain" };
  }
  const actual = new Set(json.enabled || []);
  const want = new Set(Object.keys(wanted).filter((k) => wanted[k]));
  const extra = Array.from(actual).filter((p) => !want.has(p));
  const missing = Array.from(want).filter((p) => !actual.has(p));
  if (extra.length === 0 && missing.length === 0) {
    return { kind: "matches", text: "repo file matches" };
  }
  const parts = [];
  if (missing.length) parts.push(`missing ${missing.join(", ")}`);
  if (extra.length) parts.push(`extra ${extra.join(", ")}`);
  return { kind: "drift", text: `drift · ${parts.join(" · ")}` };
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative px-4 py-3 font-mono text-[0.65rem] tracking-[0.25em] uppercase
        flex items-baseline gap-2 ease-mythic
        ${
          active
            ? "bg-[rgba(139,115,85,0.08)] text-accent"
            : "bg-bg/70 text-fg-dim hover:text-fg"
        }
      `}
      style={{
        transition:
          "color var(--motion-base) var(--ease-mythic), background-color var(--motion-base) var(--ease-mythic)",
      }}
    >
      {active ? (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 h-1 w-1 rounded-full bg-accent"
          aria-hidden="true"
        />
      ) : null}
      <span className={active ? "pl-3" : ""}>{label}</span>
      <span className={`tnum text-[0.6rem] ${active ? "text-accent" : "text-fg-ghost"}`}>
        {count}
      </span>
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-line bg-bg-warm/40 py-16 px-8 text-center">
      <div className="hairline-accent-sm justify-center mb-4 inline-flex">
        <span className="mono-label">Threshold</span>
      </div>
      <div className="serif-display text-2xl text-fg mb-3">{title}</div>
      <p className="text-fg-dim text-sm max-w-md mx-auto leading-relaxed">{body}</p>
    </div>
  );
}

function RepoCard({
  repo,
  marketplace,
  pluginState,
  status,
  projectId,
  onToggle,
  onCheck,
  onCopy,
  onRemove,
}: {
  repo: Repo;
  projectId?: string;
  marketplace: Marketplace | null;
  pluginState: Record<string, boolean>;
  status: CheckState | undefined;
  onToggle: (slug: string, enabled: boolean) => void;
  onCheck: () => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const enabledCount = Object.values(pluginState).filter(Boolean).length;
  const totalPlugins = marketplace?.plugins.length ?? 0;
  const statusText =
    status?.kind === "checking" ? "checking GitHub…" : status?.text;
  const statusTone =
    status?.kind === "matches" || status?.kind === "copied"
      ? "text-accent"
      : status?.kind === "drift" || status?.kind === "error"
        ? "text-fg"
        : "text-fg-ghost";

  return (
    <div
      id={`repo-${repo.id}`}
      className="accent-sweep border border-line bg-bg/80 p-4 flex flex-col gap-3 h-full ease-mythic scroll-mt-24 target:outline target:outline-1 target:outline-accent"
      style={{ transition: "background-color var(--motion-base) var(--ease-mythic)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={githubRepoUrl(repo.owner, repo.repo)}
            target="_blank"
            rel="noreferrer"
            className="block font-mono text-xs text-fg truncate hover:text-accent"
            title={`Open ${repo.owner}/${repo.repo} on GitHub`}
          >
            <span className="text-fg-ghost">{repo.owner}/</span>
            {repo.repo} ↗
          </a>
          <div className="flex items-center gap-2 mt-2">
            {repo.is_fork === true ? (
              <span className="font-mono text-[0.55rem] tracking-[0.2em] uppercase text-fg-ghost border border-line px-1.5 py-0.5 flex items-center gap-1">
                <GlyphFork size={10} /> fork
              </span>
            ) : null}
            {repo.default_branch ? (
              <a
                href={githubRepoUrl(repo.owner, repo.repo, `/tree/${repo.default_branch}`)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[0.6rem] text-fg-ghost tracking-[0.1em] hover:text-accent"
              >
                {repo.default_branch}
              </a>
            ) : null}
            {projectId ? (
              <Link href={projectHref(projectId)} className="font-mono text-[0.6rem] text-accent hover:text-fg">
                project →
              </Link>
            ) : null}
            {status?.kind === "matches" ? (
              <GlyphApplied size={12} className="text-accent" title="Repo file matches" />
            ) : status?.kind === "drift" ? (
              <GlyphPending size={12} className="text-fg" title="Drift detected" />
            ) : null}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-fg-ghost hover:text-fg ease-mythic shrink-0 p-1"
          title="Remove from dashboard"
          style={{ transition: "color var(--motion-base) var(--ease-mythic)" }}
        >
          <GlyphClose size={11} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(marketplace?.plugins || []).map((p) => {
          const on = pluginState[p.name] ?? false;
          return (
            <button
              key={p.name}
              onClick={() => onToggle(p.name, !on)}
              title={`${p.name} · ${p.description || ""}`}
              className={`
                relative font-mono text-[0.62rem] tracking-[0.12em] px-2.5 py-1
                border ease-mythic
                ${
                  on
                    ? "border-accent text-fg bg-[rgba(139,115,85,0.1)]"
                    : "border-line text-fg-ghost hover:text-fg-dim hover:border-fg-ghost bg-bg/70"
                }
              `}
              style={{
                transition:
                  "color var(--motion-base) var(--ease-mythic), border-color var(--motion-base) var(--ease-mythic), background-color var(--motion-base) var(--ease-mythic)",
              }}
            >
              {on ? (
                <span
                  className="absolute -left-[3px] top-1/2 -translate-y-1/2 h-2 w-[2px] bg-accent"
                  aria-hidden="true"
                />
              ) : null}
              {shortenPluginName(p.name)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-auto pt-3 border-t border-line gap-2">
        <a
          href={githubBlobUrl(repo.owner, repo.repo, ".claude/settings.json")}
          target="_blank"
          rel="noreferrer"
          className={`font-mono text-[0.6rem] truncate flex-1 min-w-0 tracking-[0.1em] hover:text-accent ${statusTone}`}
          title={statusText ? `${statusText} · open .claude/settings.json on GitHub` : "Open this repo's .claude/settings.json on GitHub"}
        >
          {statusText || (
            <>
              <span className="text-fg-dim tnum">{enabledCount}</span>
              <span className="text-fg-ghost"> / {totalPlugins} wanted</span>
            </>
          )}
        </a>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onCheck}
            disabled={status?.kind === "checking"}
            title="Compare this repo's .claude/settings.json on GitHub with the chips above (read-only)"
            className="font-mono text-[0.6rem] tracking-[0.2em] uppercase px-2.5 py-1.5 border border-line text-fg-dim hover:text-fg hover:border-fg-dim ease-mythic disabled:opacity-40"
            style={{
              transition:
                "color var(--motion-base) var(--ease-mythic), border-color var(--motion-base) var(--ease-mythic)",
            }}
          >
            Check
          </button>
          <button
            onClick={onCopy}
            disabled={!marketplace}
            title="Copy a .claude/settings.json for this repo to commit yourself"
            className="lift-on-hover font-mono text-[0.6rem] tracking-[0.2em] uppercase px-3 py-1.5 bg-fg text-bg disabled:opacity-40"
          >
            Copy JSON
          </button>
        </div>
      </div>
    </div>
  );
}

function shortenPluginName(name: string): string {
  return name
    .replace(/^brand-systems$/, "brand")
    .replace(/^dev-workflows$/, "dev")
    .replace(/^content-ops$/, "content");
}
