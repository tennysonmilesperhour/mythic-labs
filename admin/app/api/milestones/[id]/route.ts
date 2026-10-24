import { body, handle } from "@/lib/api";
import { deleteMilestone, updateMilestone } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => ({ milestone: await updateMilestone(id, b) }));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    await deleteMilestone(id);
    return { ok: true };
  });
}
