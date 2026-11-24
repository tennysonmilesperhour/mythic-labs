import { body, handle } from "@/lib/api";
import { addManualWork, updateWork } from "@/lib/billing";

// PATCH { items: [{ id, hours?, status?: "unbilled"|"excluded", note? }] } · edit billable work.
export async function PATCH(req: Request) {
  const b = await body(req);
  return handle(async () => ({ work: await updateWork(b.items) }), req);
}

// POST { project_id, title, hours, date?, note? } · record time by hand.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => ({ work: await addManualWork(b) }), req);
}
