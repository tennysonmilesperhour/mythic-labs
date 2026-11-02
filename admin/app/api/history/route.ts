import { handle } from "@/lib/api";
import { getHistory, historyAvailable } from "@/lib/projects";

// GET [?project=<id>][&limit=50] · recent commits to the data store, newest first.
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const project = url.searchParams.get("project") || undefined;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));
    if (!historyAvailable()) return { available: false, commits: [] };
    return { available: true, commits: await getHistory(project, limit) };
  });
}
