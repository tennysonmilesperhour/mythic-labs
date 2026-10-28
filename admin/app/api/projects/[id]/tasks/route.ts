import { body, handle } from "@/lib/api";
import { createTask, createTasks } from "@/lib/projects";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  if (Array.isArray(b.items)) {
    return handle(() => createTasks(id, b.items as Record<string, unknown>[]), req);
  }
  return handle(async () => ({ task: await createTask(id, b) }), req);
}
