import { body, handle } from "@/lib/api";
import { applyApprovals, listApprovals } from "@/lib/projects";

// GET · everything waiting on your yes or no: agent proposals, offers to take a
// task, proposed decisions and finished agent work.
export async function GET() {
  return handle(async () => ({ items: await listApprovals() }));
}

// POST { items: [{ kind, id, action: "approve"|"reject", project_id?, note? }] }
// Applies them all in one commit. Each item succeeds or fails on its own.
// Returns { results, undo }; POST the undo list to /api/approvals/undo to reverse it.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(() => applyApprovals(b.items), req);
}
