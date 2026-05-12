import { listRepos, listRepoPlugins } from "@/lib/db";
import { fetchMarketplace } from "@/lib/brain";
import ReposClient from "./ReposClient";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  let repos: Awaited<ReturnType<typeof listRepos>> = [];
  let marketplace: Awaited<ReturnType<typeof fetchMarketplace>> | null = null;
  const pluginsByRepo: Record<string, Record<string, boolean>> = {};
  let initialError: string | null = null;

  try {
    [repos, marketplace] = await Promise.all([
      listRepos(),
      fetchMarketplace(),
    ]);
    const allPlugins = await Promise.all(
      repos.map((r) => listRepoPlugins(r.id))
    );
    repos.forEach((r, idx) => {
      pluginsByRepo[r.id] = {};
      for (const rp of allPlugins[idx]) {
        pluginsByRepo[r.id][rp.plugin_slug] = rp.enabled;
      }
    });
  } catch (err: unknown) {
    initialError = (err as Error).message;
  }

  return (
    <div>
      <div className="mono-label mb-6">01 · Repos</div>
      <h1 className="serif-display text-5xl mb-4 leading-tight">
        Consuming repos
      </h1>
      <p className="text-fg-dim text-base max-w-2xl mb-10 leading-relaxed">
        Each card is one repo. Click a plugin chip to toggle it. Hit{" "}
        <span className="text-fg">Apply</span> to commit the configuration to
        GitHub. Use the filters to focus on the repos you actually develop in.
      </p>

      {initialError ? (
        <div className="border border-line bg-bg-warm p-6 mb-8">
          <div className="mono-label mb-2">Not configured</div>
          <p className="text-fg-dim text-sm leading-relaxed">{initialError}</p>
          <p className="text-fg-ghost text-xs mt-3 font-mono">
            Set env vars in Vercel: GITHUB_TOKEN,
            NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
          </p>
        </div>
      ) : null}

      <ReposClient
        initialRepos={repos}
        marketplace={marketplace}
        initialPluginState={pluginsByRepo}
      />
    </div>
  );
}
