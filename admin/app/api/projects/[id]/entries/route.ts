import { body, handle } from "@/lib/api";
import { createEntries } from "@/lib/projects";

// Accepts one entry or many ({ items: [...] }); many is used by the GitHub importer.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  const items = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [b];
  return handle(() => createEntries(id, items));
}
