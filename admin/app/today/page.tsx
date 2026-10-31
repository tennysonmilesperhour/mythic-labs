import Link from "next/link";
import { getHub, loadAll } from "@/lib/projects";
import { WORKABLE, rankReady, today, type TaskRef } from "@/lib/projectTypes";
import { fixHref, isMine } from "@/lib/taskMap";
import TodayClient from "./TodayClient";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  let error: string | null = null;
  let hub: Awaited<ReturnType<typeof getHub>> | null = null;
  let suggestions: TaskRef[] = [];
  try {
    const [h, all] = await Promise.all([getHub(), loadAll()]);
    hub = h;
    const planned = new Set(h.today.map((t) => t.id));
    // Ready work you could pull in: yours first, then unassigned, then agents' work you might start.
    suggestions = all
      .filter((d) => WORKABLE.includes(d.project.status))
      .flatMap((d) =>
        rankReady(d.tasks, d.milestones)
          .filter((t) => !planned.has(t.id) && !t.planned_for)
          .map((t) => ({ ...t, project_name: d.project.name, project_status: d.project.status }))
      )
      .sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || Number(!b.agent) - Number(!a.agent) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
      .slice(0, 30);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error || !hub) {
    return (
      <div>
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-4">Today</h1>
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      </div>
    );
  }

  return <TodayClient hub={hub} suggestions={suggestions} day={today()} />;
}
