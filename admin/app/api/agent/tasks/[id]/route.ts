import { BadRequest, agentName, body, handle, requireAgent } from "@/lib/api";
import { loadAll, reportTask } from "@/lib/projects";
import { NotFound } from "@/lib/projects";
import { TASK_STATUSES, taskPath, waitingOn } from "@/lib/projectTypes";

type Ctx = { params: Promise<{ id: string }> };

// GET · one task with its thread: progress notes, comments and the owner's
// replies, oldest first. Poll it after asking a question or marking blocked.
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    requireAgent(req);
    const all = await loadAll();
    const d = all.find((x) => x.tasks.some((t) => t.id === id));
    const task = d?.tasks.find((t) => t.id === id);
    if (!d || !task) throw new NotFound("task not found");
    return {
      task: {
        ...task,
        path: taskPath(task, d.tasks),
        waiting_on: waitingOn(task, d.tasks).map((t) => t.title),
        subtasks: d.tasks.filter((t) => t.parent_id === task.id).map((t) => ({ id: t.id, title: t.title, status: t.status })),
      },
      project: { id: d.project.id, name: d.project.name, status: d.project.status },
      thread: d.entries
        .filter((e) => e.task_id === task.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({ id: e.id, at: e.created_at, author: e.author, title: e.title, body: e.body })),
    };
  });
}

// PATCH { status?: todo|doing|blocked|done, note? } · report progress.
// "blocked" with a note is how an agent asks you for help.
export async function PATCH(req: Request, { params }: Ctx) {
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
  }, req);
}
