import { BadRequest, agentName, body, handle, requireAgent } from "@/lib/api";
import { captureInbox } from "@/lib/projects";

// POST { title, notes?, project_id?, priority?, labels? } · propose work without
// touching any plan. It lands in the owner's inbox to accept, edit or drop.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req, b);
    if (typeof b.title !== "string" || !b.title.trim()) throw new BadRequest("title required");
    const item = await captureInbox({
      title: b.title,
      notes: typeof b.notes === "string" ? b.notes : "",
      project_id: typeof b.project_id === "string" ? b.project_id : null,
      priority: typeof b.priority === "string" ? b.priority : null,
      labels: Array.isArray(b.labels) ? b.labels : [],
      source: agent,
    });
    return { item };
  }, req);
}
