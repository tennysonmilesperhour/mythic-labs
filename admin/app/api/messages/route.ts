import { body, handle } from "@/lib/api";
import { listMessages, sendMessage } from "@/lib/projects";
import { groupThreads } from "@/lib/messageTypes";
import { ME } from "@/lib/taskMap";

// GET · every thread between you and the agents, newest first.
export async function GET() {
  return handle(async () => ({ threads: groupThreads(await listMessages()) }));
}

// POST { body, subject?, thread_id? } · write to the agents, or reply in a thread.
export async function POST(req: Request) {
  const b = await body(req);
  return handle(async () => ({ message: await sendMessage(ME, b) }), req);
}
