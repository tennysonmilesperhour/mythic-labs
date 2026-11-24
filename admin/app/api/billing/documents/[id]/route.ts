import { body, handle } from "@/lib/api";
import { updateDocument } from "@/lib/billing";

// PATCH { status?: "draft"|"sent"|"paid"|"void", notes? } · voiding an invoice returns its work to unbilled.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => ({ document: await updateDocument(id, b) }), req);
}
