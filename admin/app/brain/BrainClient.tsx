"use client";

import { useState } from "react";
import type { PluginDetail } from "@/lib/brain";
import { KIND_GLYPHS } from "@/components/Glyphs";

type Kind = "skill" | "agent" | "command" | "hook" | "mcp";

const KIND_META: Record<
  Kind,
  { label: string; color: string }
> = {
  skill: { label: "Skill", color: "text-accent" },
  agent: { label: "Agent", color: "text-fg" },
  command: { label: "Command", color: "text-accent" },
  hook: { label: "Hook", color: "text-fg-dim" },
  mcp: { label: "MCP", color: "text-fg-dim" },
};

export default function BrainClient({ plugins }: { plugins: PluginDetail[] }) {
  const [activeSlug, setActiveSlug] = useState<string>(plugins[0]?.slug || "");
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const active = plugins.find((p) => p.slug === activeSlug);

  return (
    <div>
      {/* Plugin tabs */}
      <div className="grid grid-cols-5 gap-px bg-line border border-line mb-10">
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
              data-active={isActive}
              className={`
                accent-sweep p-5 text-left ease-mythic
                ${isActive ? "bg-[rgba(139,115,85,0.06)]" : "bg-bg/70 hover:bg-bg-warm/80"}
              `}
              style={{
                transition:
                  "background-color var(--motion-base) var(--ease-mythic)",
              }}
            >
              <div
                className={`font-mono text-[0.55rem] tracking-[0.3em] uppercase mb-2 ${
                  isActive ? "text-accent" : "text-fg-ghost"
                }`}
              >
                {p.slug}
              </div>
              <div
                className={`serif-display text-[1.4rem] leading-tight mb-1 ${
                  isActive ? "text-fg" : "text-fg-dim"
                }`}
              >
                {p.name}
              </div>
              <div className="font-mono text-[0.55rem] text-fg-ghost tracking-[0.15em]">
                <span className="tnum">{total}</span>{" "}
                item{total === 1 ? "" : "s"}{" "}
                <span className="text-fg-ghost/70">·</span> v{p.version}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active plugin detail */}
      {active ? (
        <PluginDetailView
          plugin={active}
          kindFilter={kindFilter}
          setKindFilter={setKindFilter}
        />
      ) : null}
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
      <div className="bg-bg-warm/80 border border-line p-7 mb-8">
        <div className="hairline-accent-sm mb-4">
          <span className="mono-label">About {plugin.name}</span>
        </div>
        <p className="text-fg text-[1.02rem] leading-[1.85] max-w-3xl font-light dropcap">
          {plugin.description}
        </p>
      </div>

      {/* Kind filters */}
      <div className="flex flex-wrap items-stretch gap-px bg-line border border-line mb-6">
        <KindChip
          label="All"
          count={counts.all}
          active={kindFilter === "all"}
          onClick={() => setKindFilter("all")}
        />
        {(["skill", "agent", "command", "hook", "mcp"] as Kind[])
          .filter((k) => counts[k] > 0)
          .map((k) => {
            const G = KIND_GLYPHS[k];
            return (
              <KindChip
                key={k}
                label={KIND_META[k].label + "s"}
                count={counts[k]}
                active={kindFilter === k}
                onClick={() => setKindFilter(k)}
                glyph={<G size={12} />}
              />
            );
          })}
      </div>

      {/* Items grid */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-line bg-bg-warm/40 py-12 px-8 text-center">
          <div className="serif-display text-xl text-fg mb-2">
            Nothing of this kind in {plugin.slug}
          </div>
          <p className="text-fg-dim text-sm">
            Try another tab, or extend this plugin from the Authoring page.
          </p>
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
  glyph,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  glyph?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative px-4 py-3 font-mono text-[0.65rem] tracking-[0.25em] uppercase
        flex items-center gap-2 ease-mythic
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
      {glyph ? (
        <span className={active ? "text-accent" : "text-fg-ghost"}>
          {glyph}
        </span>
      ) : null}
      <span>{label}</span>
      <span
        className={`tnum text-[0.6rem] ${active ? "text-accent" : "text-fg-ghost"}`}
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
  const Glyph = KIND_GLYPHS[item.kind];
  return (
    <div
      className="accent-sweep border border-line bg-bg/80 p-5 h-full flex flex-col ease-mythic"
      style={{
        transition: "background-color var(--motion-base) var(--ease-mythic)",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`${meta.color} shrink-0`}>
            <Glyph size={18} />
          </span>
          <span
            className="font-mono text-[0.78rem] text-fg truncate tracking-[0.05em]"
            title={item.name}
          >
            {item.name}
          </span>
        </div>
        <span
          className={`font-mono text-[0.55rem] tracking-[0.25em] uppercase ${meta.color} shrink-0`}
        >
          {meta.label}
        </span>
      </div>
      <p className="text-fg-dim text-[0.82rem] leading-[1.7] flex-1">
        {item.description || (
          <span className="text-fg-ghost">
            (no description in frontmatter)
          </span>
        )}
      </p>
      <div
        className="font-mono text-[0.55rem] text-fg-ghost mt-4 truncate tracking-[0.1em]"
        title={item.path}
      >
        {item.path}
      </div>
    </div>
  );
}
