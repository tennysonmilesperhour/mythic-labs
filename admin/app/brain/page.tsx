import { fetchMarketplace, fetchPluginDetail } from "@/lib/brain";
import BrainClient from "./BrainClient";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  let plugins: Awaited<ReturnType<typeof fetchPluginDetail>>[] = [];
  let error: string | null = null;

  try {
    const marketplace = await fetchMarketplace();
    plugins = await Promise.all(
      marketplace.plugins.map((p) => fetchPluginDetail(p.name))
    );
  } catch (err: unknown) {
    error = (err as Error).message;
  }

  return (
    <div>
      <div className="hairline-accent mb-10">
        <span className="mono-label">02 · Brain</span>
      </div>

      <h1 className="serif-display text-[4rem] leading-[0.95] mb-6">
        The brain itself
      </h1>
      <p className="text-fg-dim text-[1.02rem] max-w-2xl mb-12 leading-[1.8] font-light">
        Every skill, agent, command, hook, and MCP server in the marketplace.
        Click a plugin to see what it ships. This is the catalogue consuming
        repos choose from on the Repos page.
      </p>

      {error ? (
        <div className="border border-line bg-bg-warm/80 p-6">
          <div className="mono-label mb-2">Could not load</div>
          <p className="text-fg-dim text-sm">{error}</p>
        </div>
      ) : (
        <BrainClient plugins={plugins} />
      )}
    </div>
  );
}
