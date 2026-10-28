import { BadRequest, agentName, body, handle, requireAgent } from "@/lib/api";
import { reportTask } from "@/lib/projects";
import { TASK_STATUSES } from "@/lib/projectTypes";

// PATCH { status?: todo|doing|blocked|done, note? } · report progress.
// "blocked" with a note is how an agent asks you for help.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req, b);
    const status = b.status === undefined ? undefined : String(b.status);
    if (status && !(TASK_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequest(`status must be one of ${TASK_STATUSES.join(", ")}`);
    }
    if (status === "blocked" && !b.note) throw new BadRequest("say why it's blocked in note");
    return { task: await reportTask(id, agent, { status, note: typeof b.note === "string" ? b.note : undefined }) };
  });
}
