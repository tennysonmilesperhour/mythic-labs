import { handle, markdown } from "@/lib/api";
import { getHub } from "@/lib/projects";
import { renderDigestMarkdown } from "@/lib/projectTypes";

// GET /api/digest · today's brief as Markdown: what needs you, today's plan,
// agent work, due soon, recent changes. The same text the Today page can copy.
export async function GET() {
  return handle(async () => markdown(renderDigestMarkdown(await getHub())));
}
