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
  const apiConfigured = process.env.PM_AGENT_API_ENABLED === "true" && !!process.env.PM_AGENT_TOKEN;

  return (
    <div>
      <header className="border-b border-line pb-6 mb-8">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Approvals</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Everything agents want a yes or no on, across every project: work they propose, tasks they offer to take, decisions they logged, and work they finished. Approve or decline in bulk; each batch is one commit with undo. Keys: j k move, x select, a approve, r decline, ↵ expand.
        </p>
      </header>
      <div className={`mb-8 border px-4 py-3 text-[0.82rem] leading-relaxed ${apiConfigured ? "border-line bg-bg-warm/40 text-fg-dim" : "border-accent bg-bg-warm/80 text-fg"}`}>
        {apiConfigured ? (
          <>
            <span className="mono-label mr-2">Agent API configured</span>
            The API flag and token are set. Approved items are assigned to the agent and become available when an authorized runner next connects.
          </>
        ) : (
          <>
            <span className="mono-label mr-2">Agent API disabled or missing token</span>
            The dashboard cannot accept agent calls. Enabling shared-token access requires the owner's separate approval.
          </>
        )}
        <p className="mt-2"><strong>Schedule: not verified.</strong> Last successful run: not verified. This dashboard has no scheduler or run telemetry. Deploying it does not schedule an agent; confirm the schedule and a successful run in the runner service separately.</p>
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
