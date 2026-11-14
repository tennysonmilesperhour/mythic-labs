import { handle } from "@/lib/api";
import { markThreadRead } from "@/lib/projects";

// POST · you opened the thread; its agent messages count as read.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => markThreadRead(id), req);
}
