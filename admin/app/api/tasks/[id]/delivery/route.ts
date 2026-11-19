import { body, handle } from "@/lib/api";
import { recordDelivery } from "@/lib/projects";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = await body(req);
  return handle(async () => ({ task: await recordDelivery(id, input) }), req);
}
