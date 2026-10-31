import { body, handle } from "@/lib/api";
import { captureInbox, listInbox } from "@/lib/projects";

// GET · captures waiting to be sorted, newest first.
export async function GET() {
  return handle(async () => ({ items: await listInbox() }));
}

// POST { title, notes?, project_id?, agent?, priority?, due_date?, estimate?, labels? } · capture a thought.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => ({ item: await captureInbox(b) }), req);
}
