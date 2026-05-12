import { fetchMarketplace } from "@/lib/brain";
import AuthoringClient from "./AuthoringClient";
import { GlyphCommand, GlyphMcp, GlyphApplied } from "@/components/Glyphs";

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
      <div className="hairline-accent mb-10">
        <span className="mono-label">03 · Authoring</span>
      </div>

      <h1 className="serif-display text-[4rem] leading-[0.95] mb-6">
        Extend the brain
      </h1>
      <p className="text-fg-dim text-[1.02rem] max-w-2xl mb-12 leading-[1.8] font-light">
        The <span className="text-fg">Brain</span> page shows what already
        exists. This page is where you add to it — without opening an editor,
        cloning the repo, or remembering frontmatter conventions. Every action
        here commits straight to mythic-labs and is live for every consuming
        repo on the next session.
      </p>

      <div className="grid grid-cols-3 gap-px bg-line border border-line mb-12">
        <Explainer
          glyph={<GlyphMcp size={20} className="text-accent" />}
          title="Add MCP server"
          subtitle="Register an integration"
          body="MCP servers are tools Claude can call — GitHub, Supabase, Vercel, Gmail, etc. Register one here and every repo with that plugin enabled gets the tool. The token list stays out of context until needed."
        />
        <Explainer
          glyph={<GlyphCommand size={20} className="text-accent" />}
          title="Create command"
          subtitle="Make a new slash command"
          body="Slash commands are pre-built workflows you can invoke in any consuming session. /brand-systems:diagnose is one. Author another here — it's available as /<plugin>:<name> the next time you type /."
        />
        <Explainer
          glyph={<GlyphApplied size={20} className="text-accent" />}
          title="Verify wiring"
          subtitle="Audit a consuming repo"
          body="Check if a repo's .claude/settings.json correctly references the brain and which plugins it has enabled. Catches drift between what the dashboard shows and what's actually on GitHub."
        />
      </div>

      {error ? (
        <div className="border border-line bg-bg-warm/80 p-6 mb-8">
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
  glyph,
  title,
  subtitle,
  body,
}: {
  glyph: React.ReactNode;
  title: string;
  subtitle: string;
  body: string;
}) {
  return (
    <div className="bg-bg/80 p-6 accent-sweep">
      <div className="mb-4">{glyph}</div>
      <div className="serif-display text-[1.4rem] leading-tight mb-1">
        {title}
      </div>
      <div className="mono-label-dim mb-4">{subtitle}</div>
      <p className="text-fg-dim text-[0.85rem] leading-[1.7]">{body}</p>
    </div>
  );
}
