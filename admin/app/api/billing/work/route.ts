import { body, handle } from "@/lib/api";
import { updateWork } from "@/lib/billing";

// PATCH { items: [{ id, hours?, status?: "unbilled"|"excluded", note? }] } · edit billable work.
export async function PATCH(req: Request) {
  const b = await body(req);
  return handle(async () => ({ work: await updateWork(b.items) }), req);
}
