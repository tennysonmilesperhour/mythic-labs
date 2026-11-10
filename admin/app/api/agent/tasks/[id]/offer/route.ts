import { agentName, body, handle, requireAgent } from "@/lib/api";
import { offerTask } from "@/lib/projects";

// POST { note } · ask to take an unassigned task. The owner approves or declines
// it on the Approvals page; approval assigns the task to you. A declined offer is final.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req, b);
    const task = await offerTask(id, agent, typeof b.note === "string" ? b.note : "");
    return { task: { id: task.id, title: task.title, offer: task.offer } };
  }, req);
}
