---
name: roadmap
description: Work from the Mythic Labs project roadmap. Fetch the next ready task, claim it, build it to its acceptance criteria, then report progress, log changelog entries and propose decisions back to the dashboard. Use when asked to "pick up the next task", "work the roadmap", "what should I build next", "keep going on <project>", or when running as an autonomous build agent. Also use to read a project's plan or the whole roadmap before starting work.
---

# Roadmap

The dashboard holds every project's plan: milestones, tasks with acceptance criteria and dependencies, decisions, and build instructions. This skill is the loop for working from it and keeping it true.

## Setup

Needs `MYTHIC_PM_URL` and `MYTHIC_PM_TOKEN`. The server also requires an explicit `PM_AGENT_API_ENABLED=true` setting before it accepts agent requests; it defaults to disabled. If the URL/token is missing or the API is disabled, stop and tell the user which setting is missing. Never enable the server flag yourself or invent tasks.

| Variable | Value |
|---|---|
| `MYTHIC_PM_URL` | The dashboard origin, e.g. `https://mythic-labs.vercel.app` |
| `MYTHIC_PM_TOKEN` | The dashboard's `PM_AGENT_TOKEN` |
| `MYTHIC_PM_BYPASS` | Optional. Vercel protection bypass secret, if the deployment is protected |

`PM_AGENT_API_ENABLED=true` is a server-side dashboard setting, separate from the token. An owner must deliberately enable it after reviewing the shared-token access model. Agent labels are caller-supplied names, not per-agent identity; do not enable this API for private everything-dashboard data without specific approval.

Use your agent name (e.g. `claude-code`) as `AGENT` in every call. Shell helper:

```bash
pm() { # pm METHOD PATH [JSON]
  curl -sS -X "$1" "$MYTHIC_PM_URL$2" \
    -H "Authorization: Bearer $MYTHIC_PM_TOKEN" -H "X-Agent: $AGENT" \
    ${MYTHIC_PM_BYPASS:+-H "x-vercel-protection-bypass: $MYTHIC_PM_BYPASS"} \
    -H 'content-type: application/json' ${3:+-d "$3"}
}
```

## Endpoints

| Call | Purpose |
|---|---|
| `GET /api/agent/roadmap` | All projects as Markdown: status, ready work, what needs attention |
| `GET /api/agent/projects/<id>` | One project as Markdown with task ids (`?format=json` for raw) |
| `GET /api/agent/next[?project=<id>]` | Next ready task for you, with build instructions, acceptance criteria, decisions |
| `POST /api/agent/tasks/<id>/claim` | Mark it doing and assign it to you. 409 means someone else has it or it isn't ready |
| `PATCH /api/agent/tasks/<id>` | `{"status":"doing"\|"blocked"\|"done"\|"todo","note":"…"}` |
| `POST /api/agent/projects/<id>/tasks` | Add a subtask or follow-up: `{"title","parent_id?","acceptance?","depends_on?":[ids]}` |
| `POST /api/agent/projects/<id>/entries` | `{"kind":"changelog"\|"decision"\|"progress"\|"note","title","body?"}` |
| `PATCH /api/agent/projects/<id>` | `{"next_action":"…"}` only |

## The loop

1. **Orient.** If the user named a project, find it in `GET /api/agent/roadmap` and use its id. Otherwise call `GET /api/agent/next` across all projects.
2. **Pick.** `GET /api/agent/next?project=<id>`. If `task` is null, nothing is ready: say so and stop.
3. **Claim.** `POST /api/agent/tasks/<id>/claim`. On 409, go back to step 2 once, then stop.
4. **Read before building.** Follow `project.build_instructions` exactly: branch naming, checks, definition of done. Respect every entry in `active_decisions`. The task's `acceptance` is the bar.
5. **Build.** Split large work into subtasks via `POST .../tasks` with `parent_id`, so progress is visible. Post a short `PATCH` note at meaningful checkpoints (PR opened, tests passing).
6. **Finish.** When the acceptance criteria are met and checks pass:
   - `PATCH` the task `{"status":"done","note":"<what shipped, PR link>"}`
   - log a changelog entry: `{"kind":"changelog","change_type":"added|changed|fixed|removed|security","title":"…"}`
   - if you made a choice someone might later question, record it: `{"kind":"decision","title","context","body","alternatives","consequences"}`. It lands as *proposed* for the user to accept.
   - update `next_action` if it changed.
7. **Next.** Return to step 2 until nothing is ready, the user's scope is done, or you hit a stop condition.

## Stop conditions: mark blocked, don't guess

`PATCH {"status":"blocked","note":"<the exact question or missing thing>"}` and move to the next ready task when:

- the acceptance criteria are ambiguous or contradict a decision
- the work needs credentials, paid services, production data, or a destructive action
- the change is architectural and no accepted decision covers it
- checks fail for reasons outside the task

A blocked task shows up at the top of the user's dashboard. That's how you ask for help.

## Output to the user

End each session with a short punch list: tasks finished (with PR links), tasks blocked (with the question), decisions proposed, and what's ready next.

## Guardrails

- Only change tasks you claimed, plus subtasks you created.
- Never mark a task done without meeting its acceptance criteria. If there are none, write them into a progress note before you start.
- Never set a decision to accepted. Only the user can.
- Don't log noise: one progress note per real checkpoint, one changelog entry per user-visible change.
