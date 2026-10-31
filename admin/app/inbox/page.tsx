import Link from "next/link";
import { listInbox, loadAll } from "@/lib/projects";
import { AGENT_PRESETS, sortProjects } from "@/lib/projectTypes";
import { fixHref } from "@/lib/taskMap";
import InboxClient, { type InboxProject } from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  let error: string | null = null;
  let items: Awaited<ReturnType<typeof listInbox>> = [];
  let projects: InboxProject[] = [];
  let agents: string[] = AGENT_PRESETS;
  try {
    const [list, all] = await Promise.all([listInbox(), loadAll()]);
    items = list;
    projects = sortProjects(all.map((d) => d.project)).map((p) => {
      const d = all.find((x) => x.project.id === p.id)!;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        agents: p.agents,
        milestones: d.milestones.filter((m) => !m.done).sort((a, b) => a.sort_order - b.sort_order).map((m) => ({ id: m.id, title: m.title })),
      };
    });
    agents = Array.from(new Set([...AGENT_PRESETS, ...all.flatMap((d) => d.project.agents)]));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div>
      <header className="border-b border-line pb-6 mb-10">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Inbox</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Everything captured in a hurry, by you (press c anywhere) or proposed by an agent. Sort each one into a project as a task, or drop it. Keys: j k move, ↵ add to the chosen project, ⌫ drop.
        </p>
      </header>
      {error ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : (
        <InboxClient initial={items} projects={projects} agents={agents} />
      )}
    </div>
  );
}
