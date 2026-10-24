import { body, handle } from "@/lib/api";
import { deleteTask, updateTask } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => ({ task: await updateTask(id, b) }));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    await deleteTask(id);
    return { ok: true };
  });
}
