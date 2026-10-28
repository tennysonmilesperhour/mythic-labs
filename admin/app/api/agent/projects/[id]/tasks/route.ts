import { BadRequest, agentName, body, handle, requireAgent } from "@/lib/api";
import { createAgentTask } from "@/lib/projects";

// POST { title, parent_id?, milestone_id?, notes?, acceptance?, depends_on?, priority?, assign_self? }
// Agents add subtasks or follow-ups they discover. Logged as progress.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req, b);
    if (typeof b.title !== "string" || !b.title.trim()) throw new BadRequest("title required");
    const task = await createAgentTask(id, agent, {
      title: b.title,
      parent_id: b.parent_id ?? null,
      milestone_id: b.milestone_id ?? null,
      notes: b.notes ?? "",
      acceptance: b.acceptance ?? "",
      depends_on: Array.isArray(b.depends_on) ? b.depends_on : [],
      priority: b.priority ?? "medium",
      agent: b.assign_self ? agent : null,
    });
    return { task };
  }, req);
}
