import { fetchMarketplace } from "@/lib/brain";
import AuthoringClient from "./AuthoringClient";

export const dynamic = "force-dynamic";

export default async function AuthoringPage() {
  let marketplace: Awaited<ReturnType<typeof fetchMarketplace>> | null = null;
  let error: string | null = null;
  try {
    marketplace = await fetchMarketplace();
  } catch (err: unknown) {
    error = (err as Error).message;
  }

  return (
    <div>
      <div className="mono-label mb-6">03 · Authoring</div>
      <h1 className="serif-display text-5xl mb-6 leading-tight">
        Add to the brain <em className="text-accent">without leaving the dashboard.</em>
      </h1>
      <p className="text-fg-dim text-base max-w-2xl mb-12 leading-relaxed">
        Three tools for the things normally done by hand: registering MCP servers
        inside a plugin, drafting new slash commands, and verifying a consuming
        repo's wiring against the brain marketplace.
      </p>

      {error ? (
        <div className="border border-line bg-bg-warm p-6 mb-8">
          <div className="mono-label mb-2">Marketplace unavailable</div>
          <p className="text-fg-dim text-sm">{error}</p>
        </div>
      ) : (
        <AuthoringClient marketplace={marketplace!} />
      )}
    </div>
  );
}
