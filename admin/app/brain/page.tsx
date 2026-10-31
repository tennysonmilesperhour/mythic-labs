import { fetchMarketplace, fetchPluginDetail } from "@/lib/brain";
import Link from "next/link";
import { BRAIN_OWNER, BRAIN_REPO } from "@/lib/github";
import { fixHref } from "@/lib/taskMap";
import BrainClient from "./BrainClient";

export const dynamic = "force-dynamic";

export default async function BrainPage({ searchParams }: { searchParams: Promise<{ plugin?: string }> }) {
  const { plugin } = await searchParams;
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
        <span className="mono-label">03 · Brain</span>
      </div>

      <h1 className="serif-display text-[2.6rem] md:text-[4rem] leading-[0.95] mb-6">
        The brain itself
      </h1>
      <p className="text-fg-dim text-[1.02rem] max-w-2xl mb-12 leading-[1.8] font-light">
        Every skill, agent, command, hook, and MCP server in the marketplace.
        Click a plugin to see what it ships, and any item to open its file on
        GitHub. This is the catalogue consuming repos choose from on the{" "}
        <Link href="/repos" className="text-accent underline">Repos page</Link>.
      </p>

      {error ? (
        <div className="border border-line bg-bg-warm/80 p-6">
          <div className="mono-label mb-2">Could not load</div>
          <p className="text-fg-dim text-sm">{error}</p>
          <Link href={fixHref("source:market")} className="inline-block mt-3 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-accent hover:text-fg">
            Fix it step by step →
          </Link>
        </div>
      ) : (
        <BrainClient plugins={plugins} initial={plugin} brainRepo={`${BRAIN_OWNER}/${BRAIN_REPO}`} />
      )}
    </div>
  );
}
