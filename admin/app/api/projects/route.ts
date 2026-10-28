import { body, handle } from "@/lib/api";
import { createProjects, getHub } from "@/lib/projects";

export async function GET() {
  return handle(() => getHub());
}

// Accepts one project ({ name, ... }) or many ({ items: [...] }).
export async function POST(req: Request) {
  const b = await body(req);
  const items = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [b];
  return handle(() => createProjects(items), req);
}
