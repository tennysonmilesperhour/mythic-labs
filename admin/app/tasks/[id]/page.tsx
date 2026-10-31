import { notFound } from "next/navigation";
import { loadAll } from "@/lib/projects";
import { WORKABLE, rankReady, type Task } from "@/lib/projectTypes";
import { isMine } from "@/lib/taskMap";
import TaskMapClient from "./TaskMapClient";

export const dynamic = "force-dynamic";

export default async function TaskMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ why?: string }>;
}) {
  const { id } = await params;
  const { why } = await searchParams;
  const all = await loadAll();
  const detail = all.find((d) => d.tasks.some((t) => t.id === id));
  if (!detail) notFound();

  // Your other open work, so finishing this one leads straight to the next.
  const mine: Array<Task & { project_name: string }> = all
    .filter((d) => d.project.status !== "paused")
    .flatMap((d) => {
      const ready = new Set(rankReady(d.tasks, d.milestones).map((t) => t.id));
      return d.tasks
        .filter((t) => t.id !== id && isMine(t) && t.status !== "done")
        .sort(
          (a, b) =>
            Number(b.status === "doing") - Number(a.status === "doing") ||
            Number(ready.has(b.id)) - Number(ready.has(a.id)) ||
            (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
        )
        .map((t) => ({ ...t, project_name: d.project.name }));
    });

  return (
    <TaskMapClient
      initial={detail}
      taskId={id}
      why={why ?? null}
      mine={mine.slice(0, 8)}
      workable={WORKABLE.includes(detail.project.status)}
    />
  );
}
