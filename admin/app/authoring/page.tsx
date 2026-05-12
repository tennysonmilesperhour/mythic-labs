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
      <h1 className="serif-display text-5xl mb-4 leading-tight">
        Extend the brain
      </h1>
      <p className="text-fg-dim text-base max-w-2xl mb-10 leading-relaxed">
        The <span className="text-fg">Brain</span> page shows what already
        exists. This page is where you add to it — without opening an editor,
        cloning the repo, or remembering frontmatter conventions. Every action
        here commits straight to mythic-labs and is live for every consuming
        repo on the next session.
      </p>

      {/* What each tool does */}
      <div className="grid grid-cols-3 gap-px bg-line border border-line mb-10">
        <Explainer
          symbol="◈"
          title="Add MCP server"
          subtitle="Register an integration"
          body="MCP servers are tools Claude can call — GitHub, Supabase, Vercel, Gmail, etc. Register one here and every repo with that plugin enabled gets the tool. The token list stays out of context until needed."
        />
        <Explainer
          symbol="/"
          title="Create command"
          subtitle="Make a new slash command"
          body="Slash commands are pre-built workflows you can invoke in any consuming session. /brand-systems:diagnose is one. Author another here — it's available as /<plugin>:<name> the next time you type /."
        />
        <Explainer
          symbol="✓"
          title="Verify wiring"
          subtitle="Audit a consuming repo"
          body="Check if a repo's .claude/settings.json correctly references the brain and which plugins it has enabled. Catches drift between what the dashboard shows and what's actually on GitHub."
        />
      </div>

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

function Explainer({
  symbol,
  title,
  subtitle,
  body,
}: {
  symbol: string;
  title: string;
  subtitle: string;
  body: string;
}) {
  return (
    <div className="bg-bg p-5">
      <div className="flex items-baseline gap-3 mb-1">
        <span className="font-mono text-base text-accent">{symbol}</span>
        <span className="serif-display text-lg">{title}</span>
      </div>
      <div className="mono-label mb-3 opacity-70">{subtitle}</div>
      <p className="text-fg-dim text-[0.8rem] leading-relaxed">{body}</p>
    </div>
  );
}
