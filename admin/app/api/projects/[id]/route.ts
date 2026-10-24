import { body, handle } from "@/lib/api";
import { deleteProject, getProjectDetail, updateProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => getProjectDetail(id));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body(req);
  return handle(() => updateProject(id, b));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    await deleteProject(id);
    return { ok: true };
  });
}
