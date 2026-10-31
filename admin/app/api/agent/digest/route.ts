import { handle, markdown, requireAgent } from "@/lib/api";
import { getHub } from "@/lib/projects";
import { renderDigestMarkdown } from "@/lib/projectTypes";

// GET /api/agent/digest · the day's brief for an agent that reports to you.
export async function GET(req: Request) {
  return handle(async () => {
    requireAgent(req);
    return markdown(renderDigestMarkdown(await getHub()));
  });
}
