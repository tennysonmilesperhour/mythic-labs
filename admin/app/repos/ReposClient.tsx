"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Repo } from "@/lib/db";
import type { Marketplace } from "@/lib/brain";
import {
  GlyphApplied,
  GlyphArrow,
  GlyphClose,
  GlyphFork,
  GlyphPending,
  GlyphPlus,
} from "@/components/Glyphs";

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

  // Lazy backfill if any repo is missing is_fork.
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
      if (filter === "applied" && !r.last_applied_at) return false;
      if (filter === "pending" && r.last_applied_at) return false;
      return true;
    });
  }, [repos, filter, search]);

  const counts = useMemo(() => {
    const owned = repos.filter((r) => r.is_fork !== true).length;
    const forked = repos.filter((r) => r.is_fork === true).length;
    const applied = repos.filter((r) => r.last_applied_at).length;
    return {
      all: repos.length,
      owned,
      forked,
      applied,
      pending: repos.length - applied,
    };
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
      <div className="flex items-stretch gap-px bg-line border border-line mb-6">
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

      {/* Add panel */}
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

      {/* Repo grid */}
      {repos.length === 0 ? (
        <EmptyState
          title="No repos enrolled yet"
          body="Click + Add to paste a list of owner/repo lines. The dashboard will detect each repo's fork status and default branch automatically."
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
      <span
        className={`tnum text-[0.6rem] ${active ? "text-accent" : "text-fg-ghost"}`}
      >
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
      <p className="text-fg-dim text-sm max-w-md mx-auto leading-relaxed">
        {body}
      </p>
    </div>
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
  const isApplied = !!repo.last_applied_at;
  const hasError = applyState?.startsWith("error:");

  return (
    <div
      className="accent-sweep border border-line bg-bg/80 p-4 flex flex-col gap-3 h-full ease-mythic"
      style={{
        transition: "background-color var(--motion-base) var(--ease-mythic)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-xs text-fg truncate"
            title={`${repo.owner}/${repo.repo}`}
          >
            <span className="text-fg-ghost">{repo.owner}/</span>
            {repo.repo}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {repo.is_fork === true ? (
              <span className="font-mono text-[0.55rem] tracking-[0.2em] uppercase text-fg-ghost border border-line px-1.5 py-0.5 flex items-center gap-1">
                <GlyphFork size={10} /> fork
              </span>
            ) : null}
            <span className="font-mono text-[0.6rem] text-fg-ghost tracking-[0.1em]">
              {repo.default_branch}
            </span>
            <span
              className={`flex items-center gap-1 font-mono text-[0.6rem] tracking-[0.1em] ${
                isApplied ? "text-accent" : "text-fg-ghost"
              }`}
              title={
                isApplied
                  ? `last applied ${new Date(repo.last_applied_at!).toLocaleString()}`
                  : "no settings.json committed yet"
              }
            >
              {isApplied ? (
                <GlyphApplied size={12} className="pulse-dot" />
              ) : (
                <GlyphPending size={12} />
              )}
              {isApplied ? "applied" : "pending"}
            </span>
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

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-line gap-2">
        <div
          className={`font-mono text-[0.6rem] truncate flex-1 min-w-0 tracking-[0.1em] ${
            hasError ? "text-accent" : "text-fg-ghost"
          }`}
          title={applyState}
        >
          {applyState || (
            <>
              <span className="text-fg-dim tnum">{enabledCount}</span>
              <span className="text-fg-ghost"> / {totalPlugins} enabled</span>
            </>
          )}
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
            className="font-mono text-[0.6rem] tracking-[0.2em] uppercase px-2.5 py-1.5 border border-line text-fg-dim hover:text-fg hover:border-fg-dim ease-mythic disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              transition:
                "color var(--motion-base) var(--ease-mythic), border-color var(--motion-base) var(--ease-mythic)",
            }}
          >
            Clear
          </button>
          <button
            onClick={onApply}
            className="lift-on-hover flex items-center gap-1.5 font-mono text-[0.6rem] tracking-[0.2em] uppercase px-3 py-1.5 bg-fg text-bg"
          >
            Apply <GlyphArrow size={10} />
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
