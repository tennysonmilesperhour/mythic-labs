import { handle } from "@/lib/api";
import { listMyRepos } from "@/lib/github";

export async function GET() {
  return handle(async () => ({ repos: await listMyRepos() }));
}
