import { BadRequest, body, handle } from "@/lib/api";
import { commentOnTask } from "@/lib/projects";
import { TASK_STATUSES, type TaskStatus } from "@/lib/projectTypes";
import { ME } from "@/lib/taskMap";

// POST { body, status? } · a comment on the task's thread, from you. With `status`
// (for example "todo" to unblock) the reply and the change land in one commit.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    if (typeof b.body !== "string" || !b.body.trim()) throw new BadRequest("body required");
    const status = b.status === undefined ? undefined : String(b.status);
    if (status && !(TASK_STATUSES as readonly string[]).includes(status)) throw new BadRequest(`status must be one of ${TASK_STATUSES.join(", ")}`);
    return commentOnTask(id, ME, b.body, status as TaskStatus | undefined);
  }, req);
}
