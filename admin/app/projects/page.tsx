import Link from "next/link";
import { getHub } from "@/lib/projects";
import { EMPTY_HUB, STATUSES, type Hub, type ProjectStatus } from "@/lib/projectTypes";
import ProjectsClient from "./ProjectsClient";
import { fixHref } from "@/lib/taskMap";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; facet?: string }>;
}) {
  const { view, status, facet } = await searchParams;
  let hub: Hub = EMPTY_HUB;
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
            Projects are stored as files in a private GitHub repo. Set PM_DATA_REPO
            (owner/repo, must be private) and a GITHUB_TOKEN with Contents read and write on it.
          </p>
          <Link href={fixHref("source:store")} className="inline-block mt-3 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-accent hover:text-fg">
            Fix it step by step →
          </Link>
        </div>
      ) : null}

      <ProjectsClient hub={hub} initialView={view === "list" || view === "timeline" ? view : "board"}
        initialStatus={STATUSES.includes(status as ProjectStatus) ? (status as ProjectStatus) : "all"}
        initialFacet={/^(agent|tool|tag):./.test(facet ?? "") ? facet! : ""}
      />
    </div>
  );
}
