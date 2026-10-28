import { BadRequest, agentName, body, handle, requireAgent } from "@/lib/api";
import { createAgentEntry } from "@/lib/projects";

const KINDS = ["changelog", "decision", "progress", "note"];

// POST { kind, title, body?, ...changelog or decision fields }
// Decisions from agents always land as "proposed" so you make the call.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req, b);
    if (!KINDS.includes(String(b.kind))) throw new BadRequest(`kind must be one of ${KINDS.join(", ")}`);
    const entry = { ...b, author: agent, ...(b.kind === "decision" ? { decision_status: "proposed" } : {}) };
    delete (entry as Record<string, unknown>).agent;
    return createAgentEntry(id, agent, entry);
  }, req);
}
