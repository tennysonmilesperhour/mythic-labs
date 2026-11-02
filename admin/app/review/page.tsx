import Link from "next/link";
import { getHub, loadAll, summarize } from "@/lib/projects";
import { REVIEW_DAYS, daysSince, isOverdue, latestUpdate, sortProjects } from "@/lib/projectTypes";
import { fixHref } from "@/lib/taskMap";
import ReviewClient, { type ReviewProject } from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: startId } = await searchParams;
  let error: string | null = null;
  let rows: ReviewProject[] = [];
  let checklist = { inbox: 0, overdue: 0, decisions: 0, blocked: 0, stale: 0 };
  try {
    const [all, hub] = await Promise.all([loadAll(), getHub()]);
    const summaries = all.map(summarize);
    // Live projects first, least recently reviewed at the top; paused last.
    const order = sortProjects(summaries).sort((a, b) => {
      const live = (s: typeof a) => (s.status === "paused" ? 1 : 0);
      return live(a) - live(b) || (a.last_reviewed_at ?? "0").localeCompare(b.last_reviewed_at ?? "0");
    });
    rows = order.map((s) => {
      const d = all.find((x) => x.project.id === s.id)!;
      const since = s.last_reviewed_at ?? s.created_at;
      const update = latestUpdate(d.entries);
      return {
        project: s,
        stats: s.stats,
        health: s.health,
        attention: s.attention.filter((a) => a.key.split(":")[1] !== "review"),
        milestones: d.milestones.filter((m) => !m.done).sort((a, b) => a.sort_order - b.sort_order).map((m) => ({ id: m.id, title: m.title, target_date: m.target_date, late: isOverdue(m.target_date, m.done) })),
        sinceReview: {
          days: daysSince(since),
          done: d.tasks.filter((t) => t.done_at && t.done_at >= since).length,
          changes: d.entries.filter((e) => e.kind === "changelog" && e.created_at >= since).length,
          decisions: d.entries.filter((e) => e.kind === "decision" && e.created_at >= since).length,
        },
        update: update ? { health: update.health, title: update.title, body: update.body, at: update.created_at } : null,
        // A project nobody has reviewed is due even if it was created this morning.
        due: !s.last_reviewed_at || daysSince(s.last_reviewed_at) >= REVIEW_DAYS,
        ready: d.tasks.filter((t) => t.status === "todo" && t.agent === "me").slice(0, 3).map((t) => t.title),
      };
    });
    // The counts match the All tasks lists they link to, which leave paused projects out.
    const live = summaries.filter((s) => s.status !== "paused");
    checklist = {
      inbox: hub.inbox.length,
      overdue: live.reduce((n, s) => n + s.stats.overdue, 0),
      decisions: hub.attention.filter((a) => a.key.split(":")[1] === "decision").length,
      blocked: live.reduce((n, s) => n + s.stats.blocked, 0),
      stale: hub.attention.filter((a) => a.key.split(":")[1] === "stale").length,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div>
      <header className="border-b border-line pb-6 mb-10">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Review</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          A weekly pass over every project, least recently reviewed first. For each one: is the next action still right, is anything stuck, and how is it going? Mark it reviewed and move on. Ten minutes, once a week, keeps the whole portfolio honest.
        </p>
      </header>
      {error ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : (
        <ReviewClient rows={rows} startId={startId ?? null} checklist={checklist} />
      )}
    </div>
  );
}
