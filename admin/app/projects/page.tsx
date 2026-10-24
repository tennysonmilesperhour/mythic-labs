import { listProjectSummaries } from "@/lib/projects";
import ProjectsClient from "./ProjectsClient";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let data: Awaited<ReturnType<typeof listProjectSummaries>> = { projects: [], timeline: [] };
  let initialError: string | null = null;
  try {
    data = await listProjectSummaries();
  } catch (err: unknown) {
    initialError = (err as Error).message;
  }

  return (
    <div>
      <div className="hairline-accent mb-10">
        <span className="mono-label">01 · Projects</span>
      </div>
      <h1 className="serif-display text-[4rem] leading-[0.95] mb-6">
        Everything you&apos;re building
      </h1>
      <p className="text-fg-dim text-[1.02rem] max-w-2xl mb-12 leading-[1.8] font-light">
        Every repo and idea in one place. Flip a project between active,
        building, planned and paused; open it for its plan, changelog,
        decisions, agents and tools.
      </p>

      {initialError ? (
        <div className="border border-line bg-bg-warm/80 p-6 mb-8 glow-anchor">
          <div className="mono-label mb-2">Not configured</div>
          <p className="text-fg-dim text-sm leading-relaxed">{initialError}</p>
          <p className="text-fg-ghost text-xs mt-3 font-mono">
            Run admin/supabase/migrations/0002_project_manager.sql in Supabase,
            and set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
          </p>
        </div>
      ) : null}

      <ProjectsClient
        initialProjects={data.projects}
        timeline={data.timeline}
      />
    </div>
  );
}
