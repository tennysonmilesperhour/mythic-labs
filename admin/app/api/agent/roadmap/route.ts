import { handle, markdown, requireAgent } from "@/lib/api";
import { loadAll, summarize } from "@/lib/projects";
import { renderRoadmapMarkdown, sortAttention } from "@/lib/projectTypes";

// GET /api/agent/roadmap[?format=json] · the whole portfolio, for orientation.
export async function GET(req: Request) {
  return handle(async () => {
    requireAgent(req);
    const all = await loadAll();
    const summaries = all.map(summarize);
    const attention = sortAttention(summaries.flatMap((s) => s.attention), summaries);
    if (new URL(req.url).searchParams.get("format") === "json") {
      return { projects: summaries, attention };
    }
    return markdown(renderRoadmapMarkdown(all, attention, { ids: true }));
  });
}
