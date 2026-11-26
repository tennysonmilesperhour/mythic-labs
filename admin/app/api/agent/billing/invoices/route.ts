import { agentName, body, handle, requireAgent } from "@/lib/api";
import { createDocument } from "@/lib/billing";

// POST { work_ids, notes? } · draft an invoice from unbilled items (the Monday weekly bill).
// Agents only draft: sending, marking paid and voiding stay with the owner.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    agentName(req, b);
    return { document: await createDocument({ kind: "invoice", work_ids: b.work_ids, notes: b.notes }) };
  }, req);
}
