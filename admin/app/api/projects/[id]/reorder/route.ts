import { BadRequest, body, handle } from "@/lib/api";
import { reorderTasks } from "@/lib/projects";

// POST { order: [{ id, milestone_id?, parent_id? }] } · the plan's new task order, in one commit.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    if (!Array.isArray(b.order) || !b.order.length) throw new BadRequest("order required");
    const order = (b.order as Array<Record<string, unknown>>).map((o) => ({
      id: String(o.id ?? ""),
      ...(o.milestone_id !== undefined ? { milestone_id: o.milestone_id === null ? null : String(o.milestone_id) } : {}),
      ...(o.parent_id !== undefined ? { parent_id: o.parent_id === null ? null : String(o.parent_id) } : {}),
    }));
    return { tasks: await reorderTasks(id, order) };
  }, req);
}
