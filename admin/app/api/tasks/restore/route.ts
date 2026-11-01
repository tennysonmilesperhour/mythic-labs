import { BadRequest, body, handle } from "@/lib/api";
import { restoreTasks } from "@/lib/projects";
import type { Task } from "@/lib/projectTypes";

// POST { tasks: Task[] } · undo a delete by putting the tasks back with their original ids.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => {
    if (!Array.isArray(b.tasks) || !b.tasks.length) throw new BadRequest("tasks required");
    return restoreTasks(b.tasks as Task[]);
  }, req);
}
