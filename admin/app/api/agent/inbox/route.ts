import { BadRequest, agentName, body, handle, requireAgent } from "@/lib/api";
import { captureInbox } from "@/lib/projects";

// POST { title, notes?, project_id?, priority?, labels?, estimate?, due_date?, assign? } · propose
// work without touching any plan. It lands on the owner's Approvals page; approving it adds the
// task, assigned to you unless `assign` is "me" (work only the owner can do).
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
      estimate: typeof b.estimate === "number" ? b.estimate : null,
      due_date: typeof b.due_date === "string" ? b.due_date : null,
      // An agent can hand the work to the owner, never to another agent.
      agent: b.assign === "me" ? "me" : null,
      source: agent,
    });
    return { item };
  }, req);
}
