import { handle } from "@/lib/api";
import { getProjectDetail } from "@/lib/projects";
import { repoActivity } from "@/lib/github";

// Read-only: recent merged PRs, commits and latest release for the linked repo.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { project } = await getProjectDetail(id);
    if (!project.owner || !project.repo) throw new Error("No repo linked to this project.");
    return repoActivity(project.owner, project.repo);
  });
}
