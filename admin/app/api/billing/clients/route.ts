import { body, handle } from "@/lib/api";
import { removeClient, saveClient } from "@/lib/billing";

// POST { project_id, rate?, client_name?, client_email?, since? } · make a project client work, or edit it.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => ({ client: await saveClient(b) }), req);
}

// DELETE { project_id } · stop billing a project. Invoiced work and paperwork are kept.
export async function DELETE(req: Request) {
  const b = await body(req);
  return handle(() => removeClient(String(b.project_id || "")), req);
}
