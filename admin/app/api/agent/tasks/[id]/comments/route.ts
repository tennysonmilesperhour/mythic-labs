import { BadRequest, agentName, body, handle, requireAgent } from "@/lib/api";
import { commentOnTask } from "@/lib/projects";

// POST { body } · a comment on the task's thread. Use it to ask a question or
// report a checkpoint without changing status; the owner replies on the same thread.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req, b);
    if (typeof b.body !== "string" || !b.body.trim()) throw new BadRequest("body required");
    const { entry } = await commentOnTask(id, agent, b.body);
    return { entry };
  }, req);
}
