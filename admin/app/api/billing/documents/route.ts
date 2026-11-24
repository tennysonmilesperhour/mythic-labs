import { body, handle } from "@/lib/api";
import { createDocument } from "@/lib/billing";

// POST { kind: "estimate"|"invoice", work_ids, notes? } · make an estimate or invoice from unbilled work.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => ({ document: await createDocument(b) }), req);
}
