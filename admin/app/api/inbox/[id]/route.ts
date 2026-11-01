import { body, handle } from "@/lib/api";
import { deleteInboxItem, updateInboxItem } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => ({ item: await updateInboxItem(id, b) }), req);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => ({ ok: true, item: await deleteInboxItem(id) }), req);
}
