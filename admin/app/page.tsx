import Link from "next/link";
import { listRepos } from "@/lib/db";
import { fetchMarketplace } from "@/lib/brain";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [repos, marketplace] = await Promise.all([
    listRepos().catch(() => []),
    fetchMarketplace().catch(() => null),
  ]);

  const pluginCount = marketplace?.plugins.length ?? 0;
  const appliedCount = repos.filter((r) => r.last_applied_at).length;

  return (
    <div>
      <div className="mono-label mb-6">00 · Overview</div>
      <h1 className="serif-display text-6xl mb-6 leading-tight">
        One brain. Every repo.
      </h1>
      <p className="text-fg-dim text-lg max-w-2xl mb-12 leading-relaxed">
        This dashboard is the control room for your Claude Code skills, agents,
        commands, hooks, and MCP servers. It keeps every repo in sync with one
        source of truth so you stop copy-pasting configs and start shipping.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-px bg-line border border-line mb-16">
        <Stat label="Repos enrolled" value={repos.length} />
        <Stat label="Apply-ed" value={appliedCount} />
        <Stat label="Plugins available" value={pluginCount} />
        <Stat label="Source" value="mythic-labs" mono />
      </div>

      {/* Problem / solution */}
      <div className="mb-16">
        <div className="mono-label mb-6">The problem</div>
        <h2 className="serif-display text-3xl mb-8 max-w-3xl leading-snug">
          Every repo wants the same Claude Code setup. Maintaining it by hand
          is a tax that grows with every new project.
        </h2>

        <div className="grid grid-cols-2 gap-px bg-line border border-line">
          <Column
            tag="Without this system"
            color="dim"
            rows={[
              "Copy SKILL.md files into each repo by hand",
              "Edit .claude/settings.json in 14 places to flip one plugin",
              "Update an MCP server once → commit it to every repo separately",
              "No idea which repos have which capabilities — grep to find out",
              "Want to roll back a skill? Hope you remembered where it went",
            ]}
          />
          <Column
            tag="With this system"
            color="accent"
            rows={[
              "Skills, agents, commands live once in mythic-labs",
              "Toggle plugins per repo here — one click writes settings.json",
              "MCP changes propagate to every consuming repo automatically",
              "See every repo's wiring in one grid, color-coded",
              "Disable all in one click. Re-enable with one click.",
            ]}
          />
        </div>
      </div>

      {/* How it works */}
      <div className="mb-16">
        <div className="mono-label mb-6">How it operates</div>
        <div className="grid grid-cols-3 gap-px bg-line border border-line">
          <Step
            num="01"
            title="You toggle"
            body="Pick which plugins each repo loads — brand-systems, dev-workflows, content-ops, research, comms."
          />
          <Step
            num="02"
            title="We commit"
            body="One click writes a .claude/settings.json into the repo, pointing at mythic-labs as the brain."
          />
          <Step
            num="03"
            title="Claude reads"
            body="Next session in that repo, Claude Code loads the enabled plugins. Skills become reachable, commands are registered."
          />
        </div>
      </div>

      {/* Section nav */}
      <div className="mb-6 mono-label">Where to go next</div>
      <div className="grid grid-cols-3 gap-6">
        <Card
          num="01"
          title="Repos"
          desc="Pick which plugins each repo loads, then one-click Apply to commit the config."
          href="/repos"
        />
        <Card
          num="02"
          title="Brain"
          desc="Browse every skill, agent, command, hook, and MCP server in the marketplace."
          href="/brain"
        />
        <Card
          num="03"
          title="Authoring"
          desc="Extend the brain itself: register new MCP servers, draft slash commands, verify wiring."
          href="/authoring"
        />
      </div>
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
    <div className="bg-bg p-6">
      <div className="mono-label mb-3">{label}</div>
      <div
        className={
          mono
            ? "font-mono text-lg text-fg"
            : "serif-display text-4xl text-fg"
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
    <div className="bg-bg p-6">
      <div
        className={`font-mono text-[0.6rem] tracking-[0.25em] uppercase mb-5 ${
          color === "accent" ? "text-accent" : "text-fg-ghost"
        }`}
      >
        {tag}
      </div>
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-baseline gap-3 text-sm leading-relaxed"
          >
            <span
              className={`font-mono text-[0.6rem] mt-1 shrink-0 ${
                color === "accent" ? "text-accent" : "text-fg-ghost"
              }`}
            >
              {color === "accent" ? "→" : "·"}
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
    <div className="bg-bg p-6">
      <div className="font-mono text-[0.6rem] tracking-[0.25em] uppercase text-accent mb-3">
        Step {num}
      </div>
      <div className="serif-display text-2xl mb-3">{title}</div>
      <p className="text-sm text-fg-dim leading-relaxed">{body}</p>
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
      className="group block bg-bg-warm border border-line p-6 transition hover:bg-bg-deep relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 h-[2px] bg-accent transition-all duration-500 w-0 group-hover:w-full" />
      <div className="mono-label opacity-60 mb-3">{num}</div>
      <div className="serif-display text-xl mb-2">{title}</div>
      <p className="text-fg-dim text-sm leading-relaxed">{desc}</p>
      <div className="mt-4 font-mono text-[0.65rem] tracking-[0.2em] uppercase text-accent">
        Open →
      </div>
    </Link>
  );
}
