import { body, handle } from "@/lib/api";
import { triageInbox } from "@/lib/projects";

// POST { project_id, milestone_id?, parent_id?, agent?, priority?, due_date?, estimate?, labels?, planned_for? }
// Turns the capture into a task in one commit.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(() => triageInbox(id, b), req);
}
