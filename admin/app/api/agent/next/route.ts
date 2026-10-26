import { agentName, handle, requireAgent } from "@/lib/api";
import { nextTask } from "@/lib/projects";
import { renderProjectMarkdown, taskPath, waitingOn } from "@/lib/projectTypes";

// GET /api/agent/next?agent=<name>[&project=<id>] · the next ready task, with
// everything needed to start it. Read-only; claim it with POST .../claim.
export async function GET(req: Request) {
  return handle(async () => {
    requireAgent(req);
    const agent = agentName(req);
    const project = new URL(req.url).searchParams.get("project") || undefined;
    const found = await nextTask(agent, project);
    if (!found) return { task: null, message: "Nothing ready for you. Stop and report back." };
    const { task, detail } = found;
    const p = detail.project;
    const ms = detail.milestones.find((m) => m.id === task.milestone_id);
    const subtasks = detail.tasks.filter((t) => t.parent_id === task.id);
    return {
      task: {
        id: task.id,
        title: task.title,
        path: taskPath(task, detail.tasks),
        priority: task.priority,
        due_date: task.due_date,
        notes: task.notes,
        acceptance: task.acceptance,
        assigned_to: task.agent,
        milestone: ms ? { title: ms.title, target_date: ms.target_date, goal: ms.description } : null,
        finished_subtasks: subtasks.map((t) => t.title),
        waiting_on: waitingOn(task, detail.tasks).map((t) => t.title),
      },
      project: {
        id: p.id,
        name: p.name,
        repo: p.owner && p.repo ? `${p.owner}/${p.repo}` : null,
        next_action: p.next_action,
        build_instructions: p.agent_instructions,
        tools: p.tools,
        active_decisions: detail.entries
          .filter((e) => e.kind === "decision" && e.decision_status === "accepted")
          .map((e) => ({ title: e.title, decision: e.body })),
      },
      context_markdown: renderProjectMarkdown(detail, { ids: true }),
    };
  });
}
