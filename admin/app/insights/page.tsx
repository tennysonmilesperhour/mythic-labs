import Link from "next/link";
import { loadAll } from "@/lib/projects";
import { aging, byAgent, byProject, cycleTimes, estimateCoverage, forecastMilestones, throughputByWeek } from "@/lib/insights";
import { today } from "@/lib/projectTypes";
import { fixHref } from "@/lib/taskMap";
import InsightsClient from "./InsightsClient";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  let error: string | null = null;
  let data: React.ComponentProps<typeof InsightsClient> | null = null;
  try {
    const all = await loadAll();
    const day = today();
    data = {
      day,
      weeks: throughputByWeek(all, 12, day),
      cycles: cycleTimes(all, 90, day),
      forecasts: forecastMilestones(all, day),
      agents: byAgent(all, 30, day),
      projects: byProject(all, 30, day),
      aging: aging(all),
      coverage: estimateCoverage(all),
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div>
      <header className="border-b border-line pb-6 mb-10">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Insights</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Three numbers worth a weekly look: what finishes (throughput), how long it takes (cycle time), and when each milestone lands at the current rate (forecast). Everything is computed from the plan itself; estimates make the forecast sharper.
        </p>
      </header>
      {error || !data ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : (
        <InsightsClient {...data} />
      )}
    </div>
  );
}
