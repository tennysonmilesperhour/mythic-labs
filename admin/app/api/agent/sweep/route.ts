import { agentName, handle, markdown, requireAgent } from "@/lib/api";
import { readSnapshot } from "@/lib/store";
import { collectApprovals, renderSweepMarkdown } from "@/lib/approvals";

// GET /api/agent/sweep · the daily run's checklist for this agent, as Markdown:
// what to resume, what to build, what to offer, what is blocked, which projects
// have nothing ready. ?format=json adds the approvals queue as data.
export async function GET(req: Request) {
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req);
    const s = await readSnapshot();
    const details = Array.from(s.projects.values());
    if (new URL(req.url).searchParams.get("format") === "json") {
      return { markdown: renderSweepMarkdown(details, s.inbox.items, agent), approvals_waiting: collectApprovals(details, s.inbox.items).length };
    }
    return markdown(renderSweepMarkdown(details, s.inbox.items, agent));
  });
}
