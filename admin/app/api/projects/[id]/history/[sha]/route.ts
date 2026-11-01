import { handle } from "@/lib/api";
import { NotFound, getProjectAt, restoreProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string; sha: string }> };

// GET · the project as it was at that commit (a preview before restoring).
export async function GET(_req: Request, { params }: Ctx) {
  const { id, sha } = await params;
  return handle(async () => {
    const detail = await getProjectAt(id, sha);
    if (!detail) throw new NotFound("the project did not exist at that commit");
    return detail;
  });
}

// POST · restore the project to that commit's version. One new commit; nothing is rewritten.
export async function POST(req: Request, { params }: Ctx) {
  const { id, sha } = await params;
  return handle(() => restoreProject(id, sha), req);
}
