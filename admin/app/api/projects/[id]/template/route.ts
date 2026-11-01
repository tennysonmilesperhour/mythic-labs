import { BadRequest, body, handle } from "@/lib/api";
import { applyTemplate } from "@/lib/projects";
import { PLAN_TEMPLATES } from "@/lib/templates";

// GET · the templates a plan can start from.
export async function GET() {
  return handle(async () => ({ templates: PLAN_TEMPLATES.map(({ id, name, summary, milestones }) => ({ id, name, summary, milestones: milestones.length, tasks: milestones.reduce((n, m) => n + m.tasks.length, 0) })) }));
}

// POST { template, start? } · add the template's milestones and tasks to the project in one commit.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    if (typeof b.template !== "string") throw new BadRequest("template required");
    return applyTemplate(id, b.template, typeof b.start === "string" ? b.start : null);
  }, req);
}
