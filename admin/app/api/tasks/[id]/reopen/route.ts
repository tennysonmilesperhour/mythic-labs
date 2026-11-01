import { BadRequest, body, handle } from "@/lib/api";
import { reopenTask } from "@/lib/projects";
import { RECURRENCES, TASK_STATUSES, type Recurrence, type TaskStatus } from "@/lib/projectTypes";

// POST { status?, recurrence?, planned_for?, spawned_id? } · undo finishing a task in one commit:
// reopen it (todo by default), give its recurrence rule back and remove the occurrence that
// finishing it spawned (`spawned_id`), unless someone has started that occurrence meanwhile.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    const input: Parameters<typeof reopenTask>[1] = {};
    if (b.status !== undefined) {
      if (!(TASK_STATUSES as readonly string[]).includes(String(b.status)) || b.status === "done") throw new BadRequest("status must be an open task status");
      input.status = b.status as TaskStatus;
    }
    if ("recurrence" in b) {
      if (b.recurrence !== null && !(RECURRENCES as readonly string[]).includes(String(b.recurrence))) throw new BadRequest(`recurrence must be one of ${RECURRENCES.join(", ")}, or null`);
      input.recurrence = (b.recurrence as Recurrence | null) ?? null;
    }
    if ("planned_for" in b) input.planned_for = b.planned_for === null ? null : String(b.planned_for);
    if (b.spawned_id !== undefined) {
      if (typeof b.spawned_id !== "string") throw new BadRequest("spawned_id must be a task id");
      input.spawned_id = b.spawned_id;
    }
    return reopenTask(id, input);
  }, req);
}
