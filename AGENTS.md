# AGENTS.md

Instructions for coding agents (Codex, Claude Code, Cursor, and others) working in this repo. `CLAUDE.md` is the full guide to the plugin marketplace; read it first. This file adds what you need for the dashboard in `admin/`.

## The dashboard has no database

`admin/` is a Next.js app on Vercel. All of its data is committed as files to the `roadmap-data` branch of a **private** repo named by `PM_DATA_REPO`. Never this repo: it's public, and the data includes private repo names and descriptions. The store refuses public repos; keep that check.

- `projects/<id>.json` holds one project's plan, log and settings, and is the source of truth. `projects/<id>.md` is generated from it on every write.
- `repos.json` holds the Repos page's tracked exceptions.

Rules for changing it:

- **Go through `lib/store.ts` `mutate()`.** It reads the branch head, applies your function to a draft, commits every changed file at once, and retries on a non-fast-forward. Do validation inside the function and throw to abort; it can run more than once.
- **Keep checks that guard a write inside the same `mutate()` call.** For example, `claimTask` checks "not claimed by someone else" inside the call, which makes claims race-safe. Reading first and writing in a second call brings the race back.
- `lib/projects.ts` and `lib/db.ts` are the only modules that should call the store. Routes and UI use their exported functions.
- Don't hand-edit the data branch while the dashboard is live. The store rejects stale writes, but a hand edit can still race it.
- No Supabase. It was removed on purpose; don't reintroduce it.

## Shared logic is client-safe

`lib/projectTypes.ts` holds the types and the rules the UI and the agent API share. It must stay importable from client components (no Node APIs):

- **Readiness:** todo, every `depends_on` task done, every descendant done. Subtasks inherit their ancestors' priority for ordering.
- **The attention engine,** which drives the "Needs attention" lists.
- **The Markdown renderers** for `PROJECT.md` and the roadmap.

## Agent API

`/api/agent/*` requires `Authorization: Bearer $PM_AGENT_TOKEN` and an agent name (`X-Agent` or `?agent=`). `admin/README.md` lists the endpoints. Invariants:

- Decisions an agent creates are always stored as `proposed`.
- An agent can change only `next_action` on a project.
- `blocked` requires a note.
- `done` is refused while subtasks are open.
- Claims 409 if another agent holds the task or the task isn't ready.

`dev-workflows/skills/roadmap/SKILL.md` teaches agents this loop. If you change the API, update the skill and `admin/README.md` with it.

## Verify before pushing

```bash
cd admin
npx tsc --noEmit -p . && npx next build
node scripts/fake-github.mjs &   # fake GitHub Git Data API on :4010
GITHUB_TOKEN=fake GITHUB_API_URL=http://localhost:4010 PM_DATA_REPO=test/data PM_AGENT_TOKEN=smoke-token npx next start &
node scripts/smoke.mjs           # agent loop, claim race, parallel writes
```

`claude plugin validate ./dev-workflows` checks the plugin. Use fictional names in fixtures and tests.
