"use client";

import { useState, useTransition } from "react";
import type { Repo } from "@/lib/db";
import type { Marketplace } from "@/lib/brain";

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
      // refresh list
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
    setApplyState((s) => ({ ...s, [repoId]: "applying" }));
    const res = await fetch(`/api/repos/${repoId}/apply`, { method: "POST" });
    const json = await res.json();
    if (json.error) {
      setApplyState((s) => ({ ...s, [repoId]: `error: ${json.error}` }));
    } else {
      setApplyState((s) => ({
        ...s,
        [repoId]: `applied · ${json.commit_sha.slice(0, 7)}`,
      }));
    }
  };

  const disableAllRepo = async (repoId: string) => {
    if (
      !confirm(
        "Disable all plugins for this repo and write the cleared settings.json to GitHub?"
      )
    )
      return;
    setApplyState((s) => ({ ...s, [repoId]: "disabling all…" }));
    const res = await fetch(`/api/repos/${repoId}/disable-all`, {
      method: "POST",
    });
    const json = await res.json();
    if (json.error) {
      setApplyState((s) => ({ ...s, [repoId]: `error: ${json.error}` }));
      return;
    }
    // Reflect new "all off" state in the UI immediately.
    setPluginState((s) => {
      const next = { ...(s[repoId] || {}) };
      for (const slug of Object.keys(next)) next[slug] = false;
      (marketplace?.plugins || []).forEach((p) => {
        next[p.name] = false;
      });
      return { ...s, [repoId]: next };
    });
    setApplyState((s) => ({
      ...s,
      [repoId]: `disabled all · ${json.commit_sha.slice(0, 7)}`,
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
      {/* Paste-in panel */}
      <div className="border border-line bg-bg-warm p-8 mb-12">
        <div className="mono-label mb-4">Add repos</div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder={"owner/repo\nhttps://github.com/owner/another-repo\n…"}
          className="w-full bg-bg border border-line p-4 font-mono text-sm leading-relaxed text-fg placeholder:text-fg-ghost focus:outline-none focus:border-accent transition"
        />
        <div className="flex items-center justify-between mt-4">
          <div className="font-mono text-xs text-fg-ghost">
            One per line · {input.split("\n").filter((l) => l.trim()).length} lines
          </div>
          <button
            onClick={addRepos}
            disabled={busy || !input.trim()}
            className="font-mono text-[0.7rem] tracking-[0.25em] uppercase px-8 py-3 bg-accent text-bg hover:bg-fg transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {flash ? (
          <div className="mt-4 font-mono text-xs text-accent">{flash}</div>
        ) : null}
      </div>

      {/* Repo cards */}
      {repos.length === 0 ? (
        <div className="text-fg-ghost text-sm font-mono py-12 text-center border border-dashed border-line">
          no repos yet · paste some above
        </div>
      ) : (
        <div className="space-y-4">
          {repos.map((r) => (
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
  return (
    <div className="border border-line bg-bg p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="font-mono text-sm text-fg">
            {repo.owner}<span className="text-fg-ghost">/</span>{repo.repo}
          </div>
          <div className="font-mono text-xs text-fg-ghost mt-1">
            {repo.default_branch}
            {repo.last_applied_at ? (
              <>
                {" · last applied "}
                {new Date(repo.last_applied_at).toLocaleString()}
                {" · "}
                {repo.last_applied_sha?.slice(0, 7)}
              </>
            ) : (
              " · never applied"
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-fg-ghost hover:text-fg transition"
        >
          remove
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-6">
        {(marketplace?.plugins || []).map((p) => {
          const on = pluginState[p.name] ?? false;
          return (
            <button
              key={p.name}
              onClick={() => onToggle(p.name, !on)}
              className={`
                text-left p-3 border transition
                ${
                  on
                    ? "border-accent bg-[rgba(139,115,85,0.06)]"
                    : "border-line bg-bg hover:border-fg-dim"
                }
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`font-mono text-xs ${
                    on ? "text-fg" : "text-fg-dim"
                  }`}
                >
                  {p.name}
                </span>
                <span
                  className={`font-mono text-[0.6rem] tracking-[0.15em] uppercase ${
                    on ? "text-accent" : "text-fg-ghost"
                  }`}
                >
                  {on ? "on" : "off"}
                </span>
              </div>
              <div className="text-[0.7rem] text-fg-ghost leading-relaxed">
                {p.description?.slice(0, 80)}
                {(p.description?.length || 0) > 80 ? "…" : ""}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-line pt-4 gap-4">
        <div className="font-mono text-[0.65rem] text-fg-ghost flex-1 min-w-0 truncate">
          {applyState || (
            <>
              Click apply to write{" "}
              <span className="text-fg-dim">.claude/settings.json</span> to GitHub.
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onDisableAll}
            disabled={!anyEnabled}
            title={
              anyEnabled
                ? "Turn off every plugin and write the cleared settings.json"
                : "Nothing enabled to disable"
            }
            className="font-mono text-[0.65rem] tracking-[0.25em] uppercase px-4 py-2 border border-line text-fg-dim hover:text-fg hover:border-fg-dim transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-fg-dim"
          >
            Disable all
          </button>
          <button
            onClick={onApply}
            className="font-mono text-[0.65rem] tracking-[0.25em] uppercase px-6 py-2 bg-fg text-bg hover:bg-accent transition"
          >
            Apply →
          </button>
        </div>
      </div>
    </div>
  );
}
