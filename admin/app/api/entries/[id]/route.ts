import { body, handle } from "@/lib/api";
import { deleteEntry, updateEntry } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => ({ entry: await updateEntry(id, b) }));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    await deleteEntry(id);
    return { ok: true };
  });
}
