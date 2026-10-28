import { BadRequest, agentName, body, handle, markdown, requireAgent } from "@/lib/api";
import { getProjectDetail, updateAgentNextAction } from "@/lib/projects";
import { renderProjectMarkdown } from "@/lib/projectTypes";

type Ctx = { params: Promise<{ id: string }> };

// GET · the project as Markdown with task ids (or ?format=json).
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    requireAgent(req);
    const d = await getProjectDetail(id);
    if (new URL(req.url).searchParams.get("format") === "json") return d;
    return markdown(renderProjectMarkdown(d, { ids: true }));
  });
}

// PATCH { next_action } · agents may update the next action, nothing else.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req, b);
    if (typeof b.next_action !== "string") throw new BadRequest("only next_action can be set");
    return updateAgentNextAction(id, agent, b.next_action);
  }, req);
}
