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

  return (
    <div>
      <div className="mono-label mb-6">00 · Overview</div>
      <h1 className="serif-display text-6xl mb-8 leading-tight">
        Your central brain,{" "}
        <em className="text-accent">in one console.</em>
      </h1>
      <p className="text-fg-dim text-lg max-w-2xl mb-16 leading-relaxed">
        Manage which repos consume which plugins, browse the brain itself, and
        author new skills, commands, or MCP configurations — all from here.
      </p>

      <div className="grid grid-cols-3 gap-px bg-line border border-line mb-16">
        <Stat label="Repos enrolled" value={repos.length} />
        <Stat label="Plugins available" value={pluginCount} />
        <Stat label="Source" value="mythic-labs" mono />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card
          num="01"
          title="Repos"
          desc="Paste your repos, choose which plugins each one loads. One-click apply writes .claude/settings.json directly to GitHub."
          href="/repos"
        />
        <Card
          num="02"
          title="Brain"
          desc="Browse every plugin, skill, agent, and hook in the marketplace. Click through to view source."
          href="/brain"
        />
        <Card
          num="03"
          title="Authoring"
          desc="Add MCP server defaults, draft new slash commands, verify a repo's wiring — all without leaving the dashboard."
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
    <div className="bg-bg p-8">
      <div className="mono-label mb-3">{label}</div>
      <div
        className={
          mono
            ? "font-mono text-xl text-fg"
            : "serif-display text-5xl text-fg"
        }
      >
        {value}
      </div>
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
      className="group block bg-bg-warm border border-line p-8 transition hover:bg-bg-deep relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 h-[2px] bg-accent transition-all duration-500 w-0 group-hover:w-full" />
      <div className="mono-label opacity-60 mb-4">{num}</div>
      <div className="serif-display text-2xl mb-3">{title}</div>
      <p className="text-fg-dim text-sm leading-relaxed">{desc}</p>
      <div className="mt-6 font-mono text-[0.65rem] tracking-[0.2em] uppercase text-accent">
        Open →
      </div>
    </Link>
  );
}
