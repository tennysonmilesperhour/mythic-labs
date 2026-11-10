import Link from "next/link";
import { listApprovals, loadAll } from "@/lib/projects";
import { sortProjects } from "@/lib/projectTypes";
import { fixHref } from "@/lib/taskMap";
import ApprovalsClient, { type ApprovalProject } from "./ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  let error: string | null = null;
  let items: Awaited<ReturnType<typeof listApprovals>> = [];
  let projects: ApprovalProject[] = [];
  try {
    const [list, all] = await Promise.all([listApprovals(), loadAll()]);
    items = list;
    projects = sortProjects(all.map((d) => d.project)).map((p) => ({ id: p.id, name: p.name }));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  // Only whether the agent API is on; the token itself never leaves the server.
  const agentsOn = process.env.PM_AGENT_API_ENABLED === "true" && !!process.env.PM_AGENT_TOKEN;

  return (
    <div>
      <header className="border-b border-line pb-6 mb-8">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Approvals</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Everything agents want a yes or no on, across every project: work they propose, tasks they offer to take, decisions they logged, and work they finished. Approve or decline in bulk; each batch is one commit with undo. Keys: j k move, x select, a approve, r decline, ↵ expand.
        </p>
      </header>
      <div className={`mb-8 border px-4 py-3 text-[0.82rem] leading-relaxed ${agentsOn ? "border-line bg-bg-warm/40 text-fg-dim" : "border-accent bg-bg-warm/80 text-fg"}`}>
        {agentsOn ? (
          <>
            <span className="mono-label mr-2">Daily run</span>
            The agent API is on. A scheduled agent reads <code className="font-mono text-[0.75rem]">/api/agent/sweep</code> each morning, builds what is assigned to it, and files offers and proposals here. Approved items are assigned to the agent, so the next run picks them up.
          </>
        ) : (
          <>
            <span className="mono-label mr-2">Daily run is off</span>
            Agents cannot reach the dashboard yet. Set <code className="font-mono text-[0.75rem]">PM_AGENT_API_ENABLED=true</code> and <code className="font-mono text-[0.75rem]">PM_AGENT_TOKEN</code> on Vercel, then give the scheduled agent the same token. Until then this page shows only what is already here.
          </>
        )}
      </div>
      {error ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : (
        <ApprovalsClient initial={items} projects={projects} />
      )}
    </div>
  );
}
