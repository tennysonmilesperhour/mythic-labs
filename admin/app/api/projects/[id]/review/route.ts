import { body, handle } from "@/lib/api";
import { reviewProject } from "@/lib/projects";
import type { ProjectStatus } from "@/lib/projectTypes";

// POST { next_action?, status?, status_note?, update?: { health, body } }
// One review pass in one commit: reviewed stamp, next action, status change, written update.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(
    () =>
      reviewProject(id, {
        next_action: typeof b.next_action === "string" ? b.next_action : undefined,
        status: typeof b.status === "string" ? (b.status as ProjectStatus) : undefined,
        status_note: typeof b.status_note === "string" ? b.status_note : undefined,
        update:
          b.update && typeof b.update === "object"
            ? { health: String((b.update as Record<string, unknown>).health ?? ""), body: String((b.update as Record<string, unknown>).body ?? "") }
            : undefined,
      }),
    req
  );
}
