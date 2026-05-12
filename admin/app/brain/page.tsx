import { fetchMarketplace, fetchPluginDetail } from "@/lib/brain";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  let marketplace: Awaited<ReturnType<typeof fetchMarketplace>> | null = null;
  let details: Awaited<ReturnType<typeof fetchPluginDetail>>[] = [];
  let error: string | null = null;

  try {
    marketplace = await fetchMarketplace();
    details = await Promise.all(
      marketplace.plugins.map((p) => fetchPluginDetail(p.name))
    );
  } catch (err: unknown) {
    error = (err as Error).message;
  }

  return (
    <div>
      <div className="mono-label mb-6">02 · Brain</div>
      <h1 className="serif-display text-5xl mb-6 leading-tight">
        Every skill, agent, command, <em className="text-accent">in one place.</em>
      </h1>
      <p className="text-fg-dim text-base max-w-2xl mb-12 leading-relaxed">
        Read directly from <code className="font-mono text-fg text-sm">marketplace.json</code> and each plugin's
        manifest in the brain repo. This is what consuming repos see when they
        enable a plugin.
      </p>

      {error ? (
        <div className="border border-line bg-bg-warm p-6">
          <div className="mono-label mb-2">Could not load</div>
          <p className="text-fg-dim text-sm">{error}</p>
        </div>
      ) : (
        <div className="space-y-12">
          {details.map((p) => (
            <PluginBlock key={p.slug} plugin={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PluginBlock({
  plugin,
}: {
  plugin: Awaited<ReturnType<typeof fetchPluginDetail>>;
}) {
  return (
    <section className="border border-line bg-bg-warm">
      <div className="p-6 border-b border-line">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="serif-display text-3xl">{plugin.name}</h2>
          <div className="font-mono text-xs text-fg-ghost">
            v{plugin.version}
          </div>
        </div>
        <p className="text-fg-dim text-sm leading-relaxed max-w-3xl">
          {plugin.description}
        </p>
        <div className="flex gap-2 mt-4">
          <Badge label="skills" count={plugin.skills.length} />
          <Badge label="agents" count={plugin.agents.length} />
          <Badge label="commands" count={plugin.commands.length} />
          {plugin.hasHooks ? <Badge label="hooks" count={null} on /> : null}
          {plugin.hasMcp ? <Badge label="mcp" count={null} on /> : null}
        </div>
      </div>

      {plugin.skills.length > 0 ? (
        <Group title="Skills" items={plugin.skills} />
      ) : null}
      {plugin.agents.length > 0 ? (
        <Group title="Agents" items={plugin.agents} />
      ) : null}
      {plugin.commands.length > 0 ? (
        <Group title="Commands" items={plugin.commands} />
      ) : null}
    </section>
  );
}

function Badge({
  label,
  count,
  on,
}: {
  label: string;
  count: number | null;
  on?: boolean;
}) {
  const has = on || (count !== null && count > 0);
  return (
    <span
      className={`font-mono text-[0.6rem] tracking-[0.2em] uppercase px-3 py-1 border ${
        has ? "border-accent text-accent" : "border-line text-fg-ghost"
      }`}
    >
      {label}
      {count !== null ? <> · {count}</> : null}
    </span>
  );
}

function Group({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; description: string; path: string }>;
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <div className="px-6 pt-6 pb-2">
        <div className="mono-label">{title}</div>
      </div>
      <div>
        {items.map((it) => (
          <div
            key={it.path}
            className="px-6 py-4 border-t border-line-soft hover:bg-bg transition"
          >
            <div className="flex items-baseline justify-between mb-1">
              <div className="font-mono text-sm text-fg">{it.name}</div>
              <div className="font-mono text-[0.6rem] text-fg-ghost">
                {it.path}
              </div>
            </div>
            <div className="text-fg-dim text-sm leading-relaxed">
              {it.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
