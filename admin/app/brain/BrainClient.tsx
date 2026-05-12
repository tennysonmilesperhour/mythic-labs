"use client";

import { useState } from "react";
import type { PluginDetail } from "@/lib/brain";

type Kind = "skill" | "agent" | "command" | "hook" | "mcp";

const KIND_META: Record<Kind, { label: string; symbol: string; color: string }> = {
  skill: { label: "Skill", symbol: "◇", color: "text-accent" },
  agent: { label: "Agent", symbol: "△", color: "text-fg" },
  command: { label: "Command", symbol: "/", color: "text-accent" },
  hook: { label: "Hook", symbol: "↯", color: "text-fg-dim" },
  mcp: { label: "MCP", symbol: "◈", color: "text-fg-dim" },
};

export default function BrainClient({ plugins }: { plugins: PluginDetail[] }) {
  const [activeSlug, setActiveSlug] = useState<string>(plugins[0]?.slug || "");
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const active = plugins.find((p) => p.slug === activeSlug);

  return (
    <div>
      {/* Plugin tabs */}
      <div className="grid grid-cols-5 gap-px bg-line border border-line mb-8">
        {plugins.map((p) => {
          const total =
            p.skills.length +
            p.agents.length +
            p.commands.length +
            (p.hasHooks ? 1 : 0) +
            (p.hasMcp ? 1 : 0);
          const isActive = activeSlug === p.slug;
          return (
            <button
              key={p.slug}
              onClick={() => setActiveSlug(p.slug)}
              className={`bg-bg p-4 text-left transition ${
                isActive ? "bg-[rgba(139,115,85,0.06)]" : "hover:bg-bg-warm"
              }`}
            >
              <div
                className={`font-mono text-[0.6rem] tracking-[0.2em] uppercase mb-2 ${
                  isActive ? "text-accent" : "text-fg-ghost"
                }`}
              >
                {p.slug}
              </div>
              <div
                className={`serif-display text-xl mb-1 ${
                  isActive ? "text-fg" : "text-fg-dim"
                }`}
              >
                {p.name}
              </div>
              <div className="font-mono text-[0.6rem] text-fg-ghost">
                {total} item{total === 1 ? "" : "s"} · v{p.version}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active plugin detail */}
      {active ? <PluginDetailView plugin={active} kindFilter={kindFilter} setKindFilter={setKindFilter} /> : null}
    </div>
  );
}

function PluginDetailView({
  plugin,
  kindFilter,
  setKindFilter,
}: {
  plugin: PluginDetail;
  kindFilter: Kind | "all";
  setKindFilter: (k: Kind | "all") => void;
}) {
  // Collate every artifact into one typed list so we can filter and grid them.
  const items: Array<{
    kind: Kind;
    name: string;
    description: string;
    path: string;
  }> = [
    ...plugin.skills.map((s) => ({ ...s, kind: "skill" as const })),
    ...plugin.agents.map((a) => ({ ...a, kind: "agent" as const })),
    ...plugin.commands.map((c) => ({ ...c, kind: "command" as const })),
  ];
  if (plugin.hasHooks) {
    items.push({
      kind: "hook",
      name: "hooks.json",
      description:
        "Harness-level event handlers — run as shell commands, never enter Claude's context. Zero token cost.",
      path: `${plugin.slug}/hooks/hooks.json`,
    });
  }
  if (plugin.hasMcp) {
    items.push({
      kind: "mcp",
      name: ".mcp.json",
      description:
        "MCP server declarations bundled with this plugin — consuming repos inherit them when the plugin is enabled.",
      path: `${plugin.slug}/.mcp.json`,
    });
  }

  const counts = {
    all: items.length,
    skill: plugin.skills.length,
    agent: plugin.agents.length,
    command: plugin.commands.length,
    hook: plugin.hasHooks ? 1 : 0,
    mcp: plugin.hasMcp ? 1 : 0,
  };

  const filtered =
    kindFilter === "all" ? items : items.filter((i) => i.kind === kindFilter);

  return (
    <div>
      {/* Plugin description card */}
      <div className="bg-bg-warm border border-line p-6 mb-6">
        <div className="mono-label mb-3">About {plugin.name}</div>
        <p className="text-fg-dim text-sm leading-relaxed max-w-3xl">
          {plugin.description}
        </p>
      </div>

      {/* Kind filters */}
      <div className="flex flex-wrap gap-px bg-line border border-line mb-6">
        <KindChip
          label="All"
          count={counts.all}
          active={kindFilter === "all"}
          onClick={() => setKindFilter("all")}
          symbol="◯"
        />
        {(["skill", "agent", "command", "hook", "mcp"] as Kind[])
          .filter((k) => counts[k] > 0)
          .map((k) => (
            <KindChip
              key={k}
              label={KIND_META[k].label + "s"}
              count={counts[k]}
              active={kindFilter === k}
              onClick={() => setKindFilter(k)}
              symbol={KIND_META[k].symbol}
            />
          ))}
      </div>

      {/* Items grid */}
      {filtered.length === 0 ? (
        <div className="text-fg-ghost text-sm font-mono py-12 text-center border border-dashed border-line">
          nothing of this kind in {plugin.slug}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((it) => (
            <ItemCard key={it.path} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

function KindChip({
  label,
  count,
  active,
  onClick,
  symbol,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  symbol: string;
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
      <span className="text-[0.8rem]">{symbol}</span>
      <span>{label}</span>
      <span
        className={`text-[0.6rem] ${active ? "text-accent" : "text-fg-ghost"}`}
      >
        {count}
      </span>
    </button>
  );
}

function ItemCard({
  item,
}: {
  item: {
    kind: Kind;
    name: string;
    description: string;
    path: string;
  };
}) {
  const meta = KIND_META[item.kind];
  return (
    <div className="border border-line bg-bg p-4 h-full flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={`font-mono text-base ${meta.color} shrink-0`}>
            {meta.symbol}
          </span>
          <span className="font-mono text-sm text-fg truncate" title={item.name}>
            {item.name}
          </span>
        </div>
        <span
          className={`font-mono text-[0.55rem] tracking-[0.15em] uppercase ${meta.color} shrink-0`}
        >
          {meta.label}
        </span>
      </div>
      <p className="text-fg-dim text-[0.8rem] leading-relaxed flex-1">
        {item.description || (
          <span className="text-fg-ghost">
            (no description in frontmatter)
          </span>
        )}
      </p>
      <div
        className="font-mono text-[0.55rem] text-fg-ghost mt-3 truncate"
        title={item.path}
      >
        {item.path}
      </div>
    </div>
  );
}
