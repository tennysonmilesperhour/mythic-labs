import { getHub } from "@/lib/projects";
import type { Hub } from "@/lib/projectTypes";
import ProjectsClient from "./ProjectsClient";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let hub: Hub = { projects: [], timeline: [], attention: [], inProgress: [], upcoming: [] };
  let initialError: string | null = null;
  try {
    hub = await getHub();
  } catch (err: unknown) {
    initialError = (err as Error).message;
  }

  return (
    <div>
      <div className="hairline-accent mb-6">
        <span className="mono-label">01 · Projects</span>
      </div>
      <h1 className="serif-display text-[2.2rem] md:text-[3rem] leading-[1] mb-6">
        Everything you&apos;re building
      </h1>

      {initialError ? (
        <div className="border border-line bg-bg-warm/80 p-6 mb-8 glow-anchor">
          <div className="mono-label mb-2">Not configured</div>
          <p className="text-fg-dim text-sm leading-relaxed">{initialError}</p>
          <p className="text-fg-ghost text-xs mt-3 font-mono">
            Run admin/supabase/migrations/0002_project_manager.sql and 0003_agent_roadmap.sql in Supabase,
            and set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
          </p>
        </div>
      ) : null}

      <ProjectsClient hub={hub} />
    </div>
  );
}
