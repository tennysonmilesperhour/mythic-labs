import { agentName, body, handle, requireAgent } from "@/lib/api";
import { claimTask } from "@/lib/projects";

// POST · mark the task "doing" and assign it to the calling agent.
// 409 if another agent holds it or it isn't ready.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    return { task: await claimTask(id, agentName(req, b)) };
  }, req);
}
