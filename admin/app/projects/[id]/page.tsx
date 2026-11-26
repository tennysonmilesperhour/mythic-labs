import { notFound } from "next/navigation";
import { NotFound, getProjectDetail, loadAll } from "@/lib/projects";
import { fetchMarketplace } from "@/lib/brain";
import Link from "next/link";
import { getBilling } from "@/lib/billing";
import { hoursLabel, itemAmount, money } from "@/lib/billingTypes";
import ProjectDetailClient from "./ProjectDetailClient";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string; tab?: string; entry?: string }>;
}) {
  const { id } = await params;
  const { task, tab, entry } = await searchParams;
  let detail: Awaited<ReturnType<typeof getProjectDetail>>;
  try {
    detail = await getProjectDetail(id);
  } catch (err: unknown) {
    if (err instanceof NotFound) notFound();
    throw err;
  }

  // Suggestions for the agent / tool inputs: brain plugins plus whatever
  // other projects already use.
  const [plugins, others, billing] = await Promise.all([
    fetchMarketplace()
      .then((m) => m.plugins.map((p) => p.name))
      .catch(() => [] as string[]),
    loadAll()
      .then((all) => all.map((d) => d.project))
      .catch(() => []),
    getBilling().catch(() => null),
  ]);
  const client = billing?.clients.find((c) => c.project_id === id) || null;
  const unbilled = client ? billing!.work.filter((w) => w.project_id === id && w.status === "unbilled") : [];
  const used = (key: "agents" | "tools" | "tags") =>
    Array.from(new Set(others.flatMap((p) => p[key])));

  return (
    <>
    {client ? (
      <Link href="/billing" className="mb-6 flex flex-wrap items-center gap-3 border border-accent bg-bg-warm/60 px-4 py-2 text-xs hover:text-accent">
        <span className="mono-label">Client work</span>
        <span>{client.client_name} · {money(client.rate)}/h</span>
        <span className="text-fg-dim">Unbilled {hoursLabel(unbilled.reduce((t, w) => t + w.hours, 0))} · {money(unbilled.reduce((t, w) => t + itemAmount(w), 0))}</span>
        <span className="ml-auto">Billing →</span>
      </Link>
    ) : null}
    <ProjectDetailClient
      initial={detail}
      focusTask={task ?? null}
      initialTab={tab ?? null}
      focusEntry={entry ?? null}
      suggestions={{
        agents: used("agents"),
        tools: [...plugins, ...used("tools")],
        tags: used("tags"),
      }}
    />
    </>
  );
}
