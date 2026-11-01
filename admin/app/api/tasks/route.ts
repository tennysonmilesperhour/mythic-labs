import { BadRequest, body, handle } from "@/lib/api";
import { deleteTasks, updateTasks } from "@/lib/projects";

// PATCH { items: [{ id, ...patch }] } · edit many tasks (any projects) in one commit.
export async function PATCH(req: Request) {
  const b = await body(req);
  return handle(async () => {
    if (!Array.isArray(b.items) || !b.items.length) throw new BadRequest("items: [{ id, ...patch }] required");
    return updateTasks(b.items as Array<Record<string, unknown>>);
  }, req);
}

// DELETE { ids: [...] } · remove many tasks and their subtasks in one commit. `removed` supports undo.
export async function DELETE(req: Request) {
  const b = await body(req);
  return handle(async () => {
    if (!Array.isArray(b.ids) || !b.ids.length) throw new BadRequest("ids required");
    return { ok: true, ...(await deleteTasks(b.ids.map(String))) };
  }, req);
}
