import { BadRequest, agentName, body, handle, requireAgent } from "@/lib/api";
import { listMessages, sendMessage } from "@/lib/projects";
import { groupThreads } from "@/lib/messageTypes";
import { ME } from "@/lib/taskMap";

// GET · threads where the owner wrote last and is waiting for an agent's reply.
// ?all=1 returns every thread.
export async function GET(req: Request) {
  return handle(async () => {
    requireAgent(req);
    agentName(req);
    const all = new URL(req.url).searchParams.get("all") === "1";
    const threads = groupThreads(await listMessages()).filter((t) => all || t.awaiting_agent);
    return { threads };
  });
}

// POST { body, subject?, thread_id?, kind?: "message"|"report"|"needs_you" } · write to the owner.
// A reply (thread_id) marks the owner's messages in that thread read.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req, b);
    if (agent === ME) throw new BadRequest("agents cannot write as the owner");
    return { message: await sendMessage(agent, b) };
  }, req);
}
