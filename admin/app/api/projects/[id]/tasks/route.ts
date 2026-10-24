import { body, handle } from "@/lib/api";
import { createTask } from "@/lib/projects";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => ({ task: await createTask(id, b) }));
}
