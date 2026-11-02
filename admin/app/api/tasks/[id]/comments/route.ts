import { BadRequest, body, handle } from "@/lib/api";
import { commentOnTask } from "@/lib/projects";
import { ME } from "@/lib/taskMap";

// POST { body } · a comment on the task's thread, from you.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    if (typeof b.body !== "string" || !b.body.trim()) throw new BadRequest("body required");
    return { entry: await commentOnTask(id, ME, b.body) };
  }, req);
}
