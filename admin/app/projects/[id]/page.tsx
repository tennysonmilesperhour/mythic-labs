import { notFound } from "next/navigation";
import { NotFound, getProjectDetail, loadAll } from "@/lib/projects";
import { fetchMarketplace } from "@/lib/brain";
import ProjectDetailClient from "./ProjectDetailClient";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { id } = await params;
  const { task } = await searchParams;
  let detail: Awaited<ReturnType<typeof getProjectDetail>>;
  try {
    detail = await getProjectDetail(id);
  } catch (err: unknown) {
    if (err instanceof NotFound) notFound();
    throw err;
  }

  // Suggestions for the agent / tool inputs: brain plugins plus whatever
  // other projects already use.
  const [plugins, others] = await Promise.all([
    fetchMarketplace()
      .then((m) => m.plugins.map((p) => p.name))
      .catch(() => [] as string[]),
    loadAll()
      .then((all) => all.map((d) => d.project))
      .catch(() => []),
  ]);
  const used = (key: "agents" | "tools" | "tags") =>
    Array.from(new Set(others.flatMap((p) => p[key])));

  return (
    <ProjectDetailClient
      initial={detail}
      focusTask={task ?? null}
      suggestions={{
        agents: used("agents"),
        tools: [...plugins, ...used("tools")],
        tags: used("tags"),
      }}
    />
  );
}
