---
name: daily-run
description: The scheduled morning pass over every Mythic Labs project. Builds the tasks the owner assigned to agents, offers to take unassigned work it can do, proposes work for projects with nothing ready, and leaves everything else on the dashboard's Approvals page for the owner to approve in bulk. Use when running as the daily or scheduled agent, or when asked to "do the daily run", "run the morning sweep", "check every project for work you can do" or "work through everything assigned to you".
---

# Daily run

One pass a day over the whole portfolio. The rule that makes it safe: **you build only what the owner assigned to you.** Everything else you could do becomes an offer or a proposal on the Approvals page, and the owner approves it in bulk. Approved items are assigned to you, so tomorrow's run builds them.

## Setup

Same settings as the roadmap skill: `MYTHIC_PM_URL`, `MYTHIC_PM_TOKEN`, and `MYTHIC_PM_BYPASS` when the deployment is protected. The dashboard must have `PM_AGENT_API_ENABLED=true`. If a call returns 401 or a setting is missing, stop and report exactly which one. Never invent tasks or work around the API.

Deploying the dashboard does not schedule this skill. Do not enable the API, create credentials, expand access, or create a schedule without the owner's separate approval. Confirm the actual schedule and a successful run in the runner service before saying the daily run is operational. Task assignment does not override action-specific approvals or permissions.

Use `AGENT=claude-code` unless the run was started with another name.

```bash
pm() { # pm METHOD PATH [JSON]
  curl -sS -X "$1" "$MYTHIC_PM_URL$2" \
    -H "Authorization: Bearer $MYTHIC_PM_TOKEN" -H "X-Agent: $AGENT" \
    ${MYTHIC_PM_BYPASS:+-H "x-vercel-protection-bypass: $MYTHIC_PM_BYPASS"} \
    -H 'content-type: application/json' ${3:+-d "$3"}
}
```

## The pass

1. **Read the checklist.** `pm GET /api/agent/sweep`. It lists, in order: tasks you already claimed, tasks assigned to you that are ready (some marked "sent back"), unassigned work you could offer to take, your blocked tasks, projects with nothing ready, and your proposals still waiting. Work through it top to bottom.

2. **Resume, then build.** For each task you already claimed, then each ready task assigned to you, follow the roadmap skill's loop (claim, read the thread and build instructions, build, report). Fetch work with `pm GET "/api/agent/next?assigned=1"` so you never pick up unassigned work. A task marked "sent back" has the owner's note on its thread: read `pm GET /api/agent/tasks/<id>` first and fix what it says.
   - Open a **draft** pull request for every code change, with the task title and acceptance criteria in the description. Put the PR link in the `done` note; the Approvals page shows it.
   - When a task's repo is not in your workspace, attach it if your environment allows, otherwise mark the task blocked with what you need.
   - Budget: at most 5 tasks per run. Stop earlier if a task turns out large; split it into subtasks and leave the rest for tomorrow.

3. **Offer.** For each task in the "Offer to take unassigned work" section, decide whether you can finish it alone. Offer only when all of these hold:
   - the acceptance criteria are clear, or you can state them in one line
   - it needs no credentials, payments, production data, or accounts you lack
   - it is not a judgment call that belongs to the owner (brand, pricing, legal, hiring, anything with "owner step" in the notes)

   `pm POST /api/agent/tasks/<id>/offer '{"note":"<one line: what you will do and how you will check it>"}'`. A 409 means it was taken, already offered, or declined before; move on. Never re-offer a declined task.

4. **Propose.** For each project with nothing ready, read its next action and, if you can reach it, its repo (open issues, failing CI, TODOs, outdated dependencies, missing tests or docs). Propose at most 2 concrete pieces of work per project:
   `pm POST /api/agent/inbox '{"title":"…","notes":"<why, and what done looks like>","project_id":"<id>","estimate":2}'`
   Add `"assign":"me"` when only the owner can do it. Skip anything listed under "Your proposals still waiting".

5. **Report.** End with a short summary for the owner:
   - finished: task, project, PR link
   - offered and proposed: counts, plus one line each for anything important
   - blocked: task and the exact question
   - waiting on the owner: the approvals count from the checklist, and the dashboard's `/approvals` page

## Guardrails

- Build only tasks assigned to you. Unassigned work goes through an offer, never a claim.
- Draft pull requests only. Never merge, deploy, publish, send email, or change billing.
- Never accept a decision; log choices as proposed decisions for the owner.
- One offer per task, at most 2 proposals per project per run, no duplicates of waiting proposals.
- If the API is unreachable or returns errors for more than a couple of calls, stop and report rather than retrying in a loop.
