import { body, handle } from "@/lib/api";
import { deleteTask, updateTask } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

// PATCH · edit one task. Finishing a recurring task also returns the next occurrence as `spawned`.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body(req);
  return handle(() => updateTask(id, b), req);
}

// DELETE · remove the task and its subtasks. `removed` lets the client offer undo (POST /api/tasks/restore).
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => ({ ok: true, ...(await deleteTask(id)) }), req);
}
