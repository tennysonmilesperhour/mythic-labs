import { body, handle } from "@/lib/api";
import { createMilestone } from "@/lib/projects";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => ({ milestone: await createMilestone(id, b) }), req);
}
