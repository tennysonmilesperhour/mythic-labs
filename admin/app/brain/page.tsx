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
      <div className="mono-label mb-6">02 · Brain</div>
      <h1 className="serif-display text-5xl mb-4 leading-tight">
        The brain itself
      </h1>
      <p className="text-fg-dim text-base max-w-2xl mb-10 leading-relaxed">
        Every skill, agent, command, hook, and MCP server in the marketplace.
        Click a plugin to see what it ships. This is the catalog consuming repos
        choose from on the Repos page.
      </p>

      {error ? (
        <div className="border border-line bg-bg-warm p-6">
          <div className="mono-label mb-2">Could not load</div>
          <p className="text-fg-dim text-sm">{error}</p>
        </div>
      ) : (
        <BrainClient plugins={plugins} />
      )}
    </div>
  );
}
