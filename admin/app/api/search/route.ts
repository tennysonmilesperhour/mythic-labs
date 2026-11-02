import { handle } from "@/lib/api";
import { searchIndex } from "@/lib/projects";

// GET · a compact index of projects, tasks, milestones, entries and inbox items for the command palette.
export async function GET() {
  return handle(() => searchIndex());
}
