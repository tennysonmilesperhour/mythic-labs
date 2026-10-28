import Link from "next/link";
import { listRepos } from "@/lib/db";
import { getHub } from "@/lib/projects";
import { AttentionList } from "@/components/Glance";
import { fetchMarketplace } from "@/lib/brain";
import { GlyphArrow } from "@/components/Glyphs";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [repos, marketplace, pm] = await Promise.all([
    listRepos().catch(() => []),
    fetchMarketplace().catch(() => null),
    getHub().catch(() => null),
  ]);
  const activeProjects = (pm?.projects ?? []).filter(
    (p) => p.status === "active" || p.status === "building"
  ).length;

  const pluginCount = marketplace?.plugins.length ?? 0;

  return (
    <div>
      {/* Hairline-led label */}
      <div className="hairline-accent mb-10">
        <span className="mono-label">00 · Overview</span>
      </div>

      <h1 className="serif-display text-[3rem] md:text-[4.5rem] leading-[0.95] mb-7 max-w-3xl">
        One brain.
        <br />
        Every repo.
      </h1>

      <p className="text-fg-dim text-[1.05rem] leading-[1.85] max-w-2xl mb-16 font-light dropcap">
        This dashboard runs two things: the roadmap for everything you&apos;re
        building, and the brain of skills, agents, commands, hooks and MCP
        servers your coding agents share. Claude Code, Codex, Cursor and any
        other agent that reads the open SKILL.md format work from the same
        source, and every repo inherits it.
      </p>

      {/* Stats — tabular numerals, generous gap */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line mb-24">
        <Stat label="Projects in motion" value={activeProjects} />
        <Stat label="Plugins available" value={pluginCount} />
        <Stat label="Tracked exceptions" value={repos.length} />
        <Stat label="Brain version" value={marketplace?.version ?? "—"} mono />
      </div>

      {pm && pm.projects.length ? (
        <section className="mb-24">
          <div className="flex items-baseline justify-between mb-4">
            <div className="hairline-accent-sm">
              <span className="mono-label">Needs attention</span>
            </div>
            <Link href="/projects" className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-accent">
              All projects →
            </Link>
          </div>
          <AttentionList
            items={pm.attention}
            limit={5}
            empty="Nothing flagged across your projects."
          />
        </section>
      ) : null}

      {/* Problem / solution */}
      <section className="mb-24">
        <div className="hairline-accent-sm mb-6">
          <span className="mono-label">The problem</span>
        </div>
        <h2 className="serif-display text-[1.8rem] md:text-[2.4rem] leading-[1.1] mb-12 max-w-3xl">
          Every repo and every agent wants the same setup and the same picture
          of what&apos;s next. Keeping that in sync by hand is a tax that grows
          with every project.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line border border-line">
          <Column
            tag="Without this system"
            color="dim"
            rows={[
              "Copy SKILL.md files into each repo by hand",
              "Edit settings in 14 places to flip one plugin",
              "Update an MCP server once, then commit it to every repo separately",
              "Each agent tool keeps its own copy of the same instructions, and they drift",
              "No shared plan, so every agent session starts by asking what to work on",
            ]}
          />
          <Column
            tag="With this system"
            color="accent"
            rows={[
              "Skills, agents and commands live once in mythic-labs",
              "Enable once per machine or organization, and every repo inherits it",
              "Skills use the open SKILL.md format, so Claude Code, Codex, Cursor and Copilot read the same files",
              "One roadmap every agent reads: the next ready task, what done means, which decisions stand",
              "Repos that need something different get a config you copy, checked against GitHub",
            ]}
          />
        </div>
      </section>

      {/* How it operates */}
      <section className="mb-24">
        <div className="hairline-accent-sm mb-6">
          <span className="mono-label">How it operates</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line">
          <Step
            num="01"
            title="Enable once"
            body="Install the brain for your machine or your organization, or point any SKILL.md-aware agent at this repo's skills."
          />
          <Step
            num="02"
            title="Improve centrally"
            body="Edit a skill in mythic-labs, run its evals, push. Every agent picks up the new version on its next refresh."
          />
          <Step
            num="03"
            title="Agents pick up the work"
            body="Next session in any repo, your agent loads the enabled skills, reads the roadmap, takes the next ready task and reports back to Projects."
          />
        </div>
      </section>

      {/* Section nav */}
      <section className="glow-anchor pb-4">
        <div className="hairline-accent-sm mb-6">
          <span className="mono-label">Where to go next</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card
            num="01"
            title="Projects"
            desc="Everything you're building: status, plans, changelogs, decisions, agents and tools."
            href="/projects"
          />
          <Card
            num="02"
            title="Repos"
            desc="Enable the brain for your machine or organization, and track the few repos that need different plugins."
            href="/repos"
          />
          <Card
            num="03"
            title="Brain"
            desc="Browse every skill, agent, command, hook, and MCP server in the marketplace."
            href="/brain"
          />
          <Card
            num="04"
            title="Authoring"
            desc="Extend the brain itself: register new MCP servers, draft slash commands, verify wiring."
            href="/authoring"
          />
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: number | string;
  mono?: boolean;
}) {
  return (
    <div className="bg-bg p-7">
      <div className="mono-label mb-3">{label}</div>
      <div
        className={
          mono
            ? "font-mono text-lg text-fg tnum"
            : "serif-display text-[3rem] leading-none text-fg tnum"
        }
      >
        {value}
      </div>
    </div>
  );
}

function Column({
  tag,
  color,
  rows,
}: {
  tag: string;
  color: "dim" | "accent";
  rows: string[];
}) {
  return (
    <div className="bg-bg p-7">
      <div
        className={`font-mono text-[0.6rem] tracking-[0.3em] uppercase mb-6 ${
          color === "accent" ? "text-accent" : "text-fg-ghost"
        }`}
      >
        {tag}
      </div>
      <ul className="-mx-2">
        {rows.map((r, i) => (
          <li
            key={i}
            className="hover-shift flex items-baseline gap-3 px-2 py-2.5 text-[0.95rem] leading-[1.55]"
          >
            <span
              className={`font-mono text-[0.55rem] mt-1 shrink-0 ${
                color === "accent" ? "text-accent" : "text-fg-ghost"
              }`}
            >
              {color === "accent" ? "■" : "·"}
            </span>
            <span
              className={color === "accent" ? "text-fg" : "text-fg-dim"}
            >
              {r}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Step({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-bg p-7 accent-sweep">
      <div className="font-mono text-[0.6rem] tracking-[0.3em] uppercase text-accent mb-4">
        Step {num}
      </div>
      <div className="serif-display text-[1.75rem] leading-tight mb-3">
        {title}
      </div>
      <p className="text-[0.95rem] text-fg-dim leading-[1.7]">{body}</p>
    </div>
  );
}

function Card({
  num,
  title,
  desc,
  href,
}: {
  num: string;
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group accent-sweep block bg-bg-warm/80 border border-line p-6 ease-mythic"
      style={{ transition: "background-color var(--motion-base) var(--ease-mythic)" }}
    >
      <div className="mono-label opacity-70 mb-3">{num}</div>
      <div className="serif-display text-[1.4rem] mb-2 leading-tight">
        {title}
      </div>
      <p className="text-fg-dim text-[0.88rem] leading-[1.65] mb-5">{desc}</p>
      <div className="flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.25em] uppercase text-accent">
        <span>Open</span>
        <GlyphArrow size={12} />
      </div>
    </Link>
  );
}
