import Link from "next/link";
import { listRepos } from "@/lib/db";
import { fetchMarketplace } from "@/lib/brain";
import { GlyphArrow } from "@/components/Glyphs";

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
      {/* Hairline-led label */}
      <div className="hairline-accent mb-10">
        <span className="mono-label">00 · Overview</span>
      </div>

      <h1 className="serif-display text-[4.5rem] leading-[0.95] mb-7 max-w-3xl">
        One brain.
        <br />
        Every repo.
      </h1>

      <p className="text-fg-dim text-[1.05rem] leading-[1.85] max-w-2xl mb-16 font-light dropcap">
        This dashboard is the control room for your Claude Code skills, agents,
        commands, hooks, and MCP servers. It keeps every repo in sync with one
        source of truth so you stop copy-pasting configs and start shipping.
      </p>

      {/* Stats — tabular numerals, generous gap */}
      <div className="grid grid-cols-4 gap-px bg-line border border-line mb-24">
        <Stat label="Repos enrolled" value={repos.length} />
        <Stat label="Applied" value={appliedCount} />
        <Stat label="Plugins available" value={pluginCount} />
        <Stat label="Source" value="mythic-labs" mono />
      </div>

      {/* Problem / solution */}
      <section className="mb-24">
        <div className="hairline-accent-sm mb-6">
          <span className="mono-label">The problem</span>
        </div>
        <h2 className="serif-display text-[2.4rem] leading-[1.1] mb-12 max-w-3xl">
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
      </section>

      {/* How it operates */}
      <section className="mb-24">
        <div className="hairline-accent-sm mb-6">
          <span className="mono-label">How it operates</span>
        </div>
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
      </section>

      {/* Section nav */}
      <section className="glow-anchor pb-4">
        <div className="hairline-accent-sm mb-6">
          <span className="mono-label">Where to go next</span>
        </div>
        <div className="grid grid-cols-3 gap-5">
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
