"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Repo } from "@/lib/db";
import type { Marketplace } from "@/lib/brain";

type Filter = "all" | "owned" | "forked" | "applied" | "pending";

type Props = {
  initialRepos: Repo[];
  marketplace: Marketplace | null;
  initialPluginState: Record<string, Record<string, boolean>>;
};

export default function ReposClient({
  initialRepos,
  marketplace,
  initialPluginState,
}: Props) {
  const [repos, setRepos] = useState<Repo[]>(initialRepos);
  const [pluginState, setPluginState] = useState(initialPluginState);
  const [input, setInput] = useState("");
  const [busy, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Lazy backfill: if any repo has is_fork === null, fire a one-shot
  // server endpoint that hydrates GitHub metadata, then refresh.
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
        // Silent — backfill is best-effort.
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
      if (filter === "applied" && !r.last_applied_at) return false;
      if (filter === "pending" && r.last_applied_at) return false;
      return true;
    });
  }, [repos, filter, search]);

  const counts = useMemo(() => {
    const owned = repos.filter((r) => r.is_fork !== true).length;
    const forked = repos.filter((r) => r.is_fork === true).length;
    const applied = repos.filter((r) => r.last_applied_at).length;
    return { all: repos.length, owned, forked, applied, pending: repos.length - applied };
  }, [repos]);

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

  const applyRepo = async (repoId: string) => {
    setApplyState((s) => ({ ...s, [repoId]: "applying…" }));
    const res = await fetch(`/api/repos/${repoId}/apply`, { method: "POST" });
    const json = await res.json();
    if (json.error) {
      setApplyState((s) => ({ ...s, [repoId]: `error: ${json.error}` }));
    } else {
      setApplyState((s) => ({
        ...s,
        [repoId]: `applied · ${json.commit_sha.slice(0, 7)}`,
      }));
      // Reflect last_applied locally so the badge updates without refetch.
      setRepos((rs) =>
        rs.map((r) =>
          r.id === repoId
            ? {
                ...r,
                last_applied_at: new Date().toISOString(),
                last_applied_sha: json.commit_sha,
              }
            : r
        )
      );
    }
  };

  const disableAllRepo = async (repoId: string) => {
    if (
      !confirm(
        "Disable all plugins for this repo and write the cleared settings.json to GitHub?"
      )
    )
      return;
    setApplyState((s) => ({ ...s, [repoId]: "disabling…" }));
    const res = await fetch(`/api/repos/${repoId}/disable-all`, {
      method: "POST",
    });
    const json = await res.json();
    if (json.error) {
      setApplyState((s) => ({ ...s, [repoId]: `error: ${json.error}` }));
      return;
    }
    setPluginState((s) => {
      const next = { ...(s[repoId] || {}) };
      (marketplace?.plugins || []).forEach((p) => {
        next[p.name] = false;
      });
      return { ...s, [repoId]: next };
    });
    setApplyState((s) => ({
      ...s,
      [repoId]: `disabled · ${json.commit_sha.slice(0, 7)}`,
    }));
  };

  const removeRepo = async (repoId: string) => {
    if (!confirm("Remove this repo from the dashboard? (does not touch GitHub)"))
      return;
    await fetch(`/api/repos/${repoId}`, { method: "DELETE" });
    setRepos((rs) => rs.filter((r) => r.id !== repoId));
  };

  return (
    <div>
      {/* Filter + search bar */}
      <div className="flex items-center gap-px bg-line border border-line mb-6">
        <FilterChip
          label="All"
          count={counts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label="Owned"
          count={counts.owned}
          active={filter === "owned"}
          onClick={() => setFilter("owned")}
        />
        <FilterChip
          label="Forked"
          count={counts.forked}
          active={filter === "forked"}
          onClick={() => setFilter("forked")}
        />
        <FilterChip
          label="Applied"
          count={counts.applied}
          active={filter === "applied"}
          onClick={() => setFilter("applied")}
        />
        <FilterChip
          label="Pending"
          count={counts.pending}
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
        />
        <div className="flex-1 bg-bg flex items-center px-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search…"
            className="w-full bg-transparent border-0 outline-none font-mono text-xs text-fg placeholder:text-fg-ghost py-3"
          />
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="font-mono text-[0.65rem] tracking-[0.25em] uppercase px-6 py-3 bg-fg text-bg hover:bg-accent transition"
        >
          {showAdd ? "Close" : "+ Add"}
        </button>
      </div>

      {/* Collapsible add panel */}
      {showAdd ? (
        <div className="border border-line bg-bg-warm p-6 mb-6">
          <div className="mono-label mb-3">Paste repos</div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder={"owner/repo\nhttps://github.com/owner/another-repo\n…"}
            className="w-full bg-bg border border-line p-3 font-mono text-sm leading-relaxed text-fg placeholder:text-fg-ghost focus:outline-none focus:border-accent transition"
          />
          <div className="flex items-center justify-between mt-3">
            <div className="font-mono text-xs text-fg-ghost">
              One per line · {input.split("\n").filter((l) => l.trim()).length}{" "}
              lines · fork status auto-detected
            </div>
            <button
              onClick={addRepos}
              disabled={busy || !input.trim()}
              className="font-mono text-[0.65rem] tracking-[0.25em] uppercase px-6 py-2 bg-accent text-bg hover:bg-fg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
          {flash ? (
            <div className="mt-3 font-mono text-xs text-accent">{flash}</div>
          ) : null}
        </div>
      ) : null}

      {/* Repo grid */}
      {repos.length === 0 ? (
        <div className="text-fg-ghost text-sm font-mono py-16 text-center border border-dashed border-line">
          no repos yet · click + Add to paste some in
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-fg-ghost text-sm font-mono py-16 text-center border border-dashed border-line">
          no repos match this filter
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <RepoCard
              key={r.id}
              repo={r}
              marketplace={marketplace}
              pluginState={pluginState[r.id] || {}}
              applyState={applyState[r.id]}
              onToggle={(slug, enabled) => togglePlugin(r.id, slug, enabled)}
              onApply={() => applyRepo(r.id)}
              onDisableAll={() => disableAllRepo(r.id)}
              onRemove={() => removeRepo(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
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
        px-4 py-3 font-mono text-[0.65rem] tracking-[0.2em] uppercase transition
        flex items-baseline gap-2
        ${
          active
            ? "bg-[rgba(139,115,85,0.08)] text-accent"
            : "bg-bg text-fg-dim hover:text-fg"
        }
      `}
    >
      <span>{label}</span>
      <span
        className={`text-[0.6rem] ${active ? "text-accent" : "text-fg-ghost"}`}
      >
        {count}
      </span>
    </button>
  );
}

function RepoCard({
  repo,
  marketplace,
  pluginState,
  applyState,
  onToggle,
  onApply,
  onDisableAll,
  onRemove,
}: {
  repo: Repo;
  marketplace: Marketplace | null;
  pluginState: Record<string, boolean>;
  applyState: string | undefined;
  onToggle: (slug: string, enabled: boolean) => void;
  onApply: () => void;
  onDisableAll: () => void;
  onRemove: () => void;
}) {
  const anyEnabled = Object.values(pluginState).some(Boolean);
  const enabledCount = Object.values(pluginState).filter(Boolean).length;
  const totalPlugins = marketplace?.plugins.length ?? 0;
  const hasError = applyState?.startsWith("error:");

  return (
    <div className="border border-line bg-bg p-4 flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-fg truncate" title={`${repo.owner}/${repo.repo}`}>
            <span className="text-fg-ghost">{repo.owner}/</span>
            {repo.repo}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {repo.is_fork === true ? (
              <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-fg-ghost border border-line px-1.5 py-0.5">
                fork
              </span>
            ) : null}
            <span className="font-mono text-[0.6rem] text-fg-ghost">
              {repo.default_branch}
            </span>
            <span
              className={`font-mono text-[0.6rem] ${
                repo.last_applied_at ? "text-accent" : "text-fg-ghost"
              }`}
            >
              {repo.last_applied_at ? "● applied" : "○ pending"}
            </span>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-fg-ghost hover:text-fg transition shrink-0"
          title="Remove from dashboard"
        >
          ✕
        </button>
      </div>

      {/* Plugin chips */}
      <div className="flex flex-wrap gap-1.5">
        {(marketplace?.plugins || []).map((p) => {
          const on = pluginState[p.name] ?? false;
          return (
            <button
              key={p.name}
              onClick={() => onToggle(p.name, !on)}
              title={`${p.name} · ${p.description || ""}`}
              className={`
                font-mono text-[0.6rem] tracking-[0.1em] px-2 py-1 border transition
                ${
                  on
                    ? "border-accent bg-[rgba(139,115,85,0.08)] text-fg"
                    : "border-line bg-bg text-fg-ghost hover:text-fg-dim hover:border-fg-ghost"
                }
              `}
            >
              {shortenPluginName(p.name)}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-line-soft gap-2">
        <div
          className={`font-mono text-[0.6rem] truncate flex-1 min-w-0 ${
            hasError ? "text-accent" : "text-fg-ghost"
          }`}
          title={applyState}
        >
          {applyState || `${enabledCount}/${totalPlugins} enabled`}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onDisableAll}
            disabled={!anyEnabled}
            title={
              anyEnabled
                ? "Disable everything and write the cleared config"
                : "Nothing to disable"
            }
            className="font-mono text-[0.6rem] tracking-[0.15em] uppercase px-2 py-1.5 border border-line text-fg-dim hover:text-fg hover:border-fg-dim transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          <button
            onClick={onApply}
            className="font-mono text-[0.6rem] tracking-[0.15em] uppercase px-3 py-1.5 bg-fg text-bg hover:bg-accent transition"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Plugin names can be long; in the compact chip we drop redundant words.
 * brand-systems → brand · dev-workflows → dev · content-ops → content · etc.
 */
function shortenPluginName(name: string): string {
  return name
    .replace(/^brand-systems$/, "brand")
    .replace(/^dev-workflows$/, "dev")
    .replace(/^content-ops$/, "content");
}
