import { body, handle } from "@/lib/api";
import { undoApprovals } from "@/lib/projects";

// POST { undo } · the undo list a bulk approval returned. Restores what has not moved on since.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(() => undoApprovals(b.undo), req);
}
