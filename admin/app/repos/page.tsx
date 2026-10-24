import { listRepos, listRepoPlugins } from "@/lib/db";
import { fetchMarketplace } from "@/lib/brain";
import { BRAIN_OWNER, BRAIN_REPO } from "@/lib/github";
import CopyBlock from "@/components/CopyBlock";
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

  const brainRepo = `${BRAIN_OWNER}/${BRAIN_REPO}`;
  const marketName = marketplace?.name ?? "mythic-brain";
  const otherPlugins = (marketplace?.plugins ?? [])
    .map((p) => p.name)
    .filter((n) => n !== "brand-systems");

  return (
    <div>
      <div className="hairline-accent mb-10">
        <span className="mono-label">02 · Repos</span>
      </div>

      <h1 className="serif-display text-[4rem] leading-[0.95] mb-6">
        Enable once, everywhere
      </h1>
      <p className="text-fg-dim text-[1.02rem] max-w-2xl mb-12 leading-[1.8] font-light">
        The brain no longer commits anything to your repos. Turn it on once for
        your machine or your organization, and every repo inherits it. Track a
        repo below only when it needs a different set of plugins.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-line border border-line mb-16">
        <Path
          num="A"
          title="Your machine"
          tag="Recommended for solo work"
          body="Installs at user scope. Every repo you open in Claude Code on this machine loads the plugin. Run once per machine."
        >
          <CopyBlock
            text={`claude plugin marketplace add ${brainRepo}\nclaude plugin install brand-systems@${marketName} --scope user`}
          />
          {otherPlugins.length ? (
            <p className="font-mono text-[0.6rem] text-fg-ghost mt-3 leading-relaxed">
              Others: {otherPlugins.map((n) => `${n}@${marketName}`).join(" · ")}
            </p>
          ) : null}
        </Path>
        <Path
          num="B"
          title="Your organization"
          tag="Team & Enterprise plans"
          body="An owner adds the repo under Organization settings → Plugins & skills → Add → Sync from GitHub, then sets default access to Installed by default or Required. Members get it in Claude Code when signed in with claude.ai."
        >
          <a
            href="https://claude.ai/admin-settings/skills?tab=inventory"
            target="_blank"
            rel="noreferrer"
            className="inline-block font-mono text-[0.6rem] tracking-[0.2em] uppercase px-3 py-2 border border-line text-fg-dim hover:text-fg hover:border-fg-dim"
          >
            Open org settings ↗
          </a>
        </Path>
        <Path
          num="C"
          title="One repo, different plugins"
          tag="Exceptions only"
          body="Track the repo below, toggle its plugins, then Copy JSON and commit it as .claude/settings.json. Repo settings override your user default. Check compares what's on GitHub with what you toggled."
        />
      </div>

      {initialError ? (
        <div className="border border-line bg-bg-warm/80 p-6 mb-8 glow-anchor">
          <div className="mono-label mb-2">Not configured</div>
          <p className="text-fg-dim text-sm leading-relaxed">{initialError}</p>
          <p className="text-fg-ghost text-xs mt-3 font-mono">
            Set env vars in Vercel: GITHUB_TOKEN, NEXT_PUBLIC_SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY.
          </p>
        </div>
      ) : null}

      <div className="hairline-accent-sm mb-6">
        <span className="mono-label">Tracked exceptions</span>
      </div>

      <ReposClient
        initialRepos={repos}
        marketplace={marketplace}
        brainRepo={brainRepo}
        initialPluginState={pluginsByRepo}
      />
    </div>
  );
}

function Path({
  num,
  title,
  tag,
  body,
  children,
}: {
  num: string;
  title: string;
  tag: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-bg/80 p-6 flex flex-col gap-4">
      <div>
        <div className="font-mono text-[0.6rem] tracking-[0.3em] uppercase text-accent mb-3">
          Path {num} · {tag}
        </div>
        <div className="serif-display text-[1.5rem] leading-tight mb-2">
          {title}
        </div>
        <p className="text-fg-dim text-[0.85rem] leading-[1.7]">{body}</p>
      </div>
      {children ? <div className="mt-auto">{children}</div> : null}
    </div>
  );
}
