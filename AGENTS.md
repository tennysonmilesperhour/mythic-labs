# AGENTS.md

Instructions for coding agents (Codex, Claude Code, Cursor, and others) working in this repo. `CLAUDE.md` is the full guide to the plugin marketplace; read it first. This file adds what you need for the dashboard in `admin/`.

## Writing style

Every word that ships (site copy, dashboard UI text, docs, skills, commits, PRs) follows the **Writing style** rules in `CLAUDE.md`. In short: no em or en dashes, no "not X, but Y" framing, no "No X. Just Y." fragments, no filler words like "quietly", "seamlessly" or "delve". Say what the thing is, plainly.

## The dashboard has no database

`admin/` is a Next.js app on Vercel. All of its data is committed as files to git in a separately configured private repository. Keep `PM_DATA_OWNER`, `PM_DATA_REPO`, and `PM_DATA_BRANCH` independent of the public `BRAIN_OWNER` / `BRAIN_REPO` settings.

- `projects/<id>.json` holds one project's plan, log and settings, and is the source of truth. `projects/<id>.md` is generated from it on every write.
- `repos.json` holds the Repos page's tracked exceptions.
- `operations.json` stores durable idempotency receipts, committed atomically with the request's changes.
- `inbox.json` holds quick captures and agent proposals. It is optional: a missing file reads as an empty inbox and is written on the first capture.
- The target repository must be verified private, and the branch plus initial reviewed data must already exist. Missing, inaccessible, or malformed state is an error, never an empty store. A validated legacy project-only snapshot can be read and receives missing versioned metadata atomically with its first mutation.
- Fields added after the first release (task estimate, planned_for, recurrence, labels, snoozed_until; entry task_id and health; project last_reviewed_at) are optional in stored files. `normalizeDetail()` in `lib/projectTypes.ts` fills defaults on read, so code can rely on complete records. Add new fields the same way: optional on disk, normalized on read.
- Preview deployments may use only a `preview/` data branch; production may not use one.

Rules for changing it:

- **Go through `lib/store.ts` `mutate()`.** It reads the branch head, applies your function to a draft, commits every changed file at once, and retries on a non-fast-forward. Do validation inside the function and throw to abort; it can run more than once.
- **Keep checks that guard a write inside the same `mutate()` call.** For example, `claimTask` checks "not claimed by someone else" inside the call, which makes claims race-safe. Reading first and writing in a second call brings the race back. Anything that must be all-or-nothing (bulk edits, inbox triage, templates, restores) is one `mutate()`.
- `lib/projects.ts` and `lib/db.ts` are the only modules that should call the store. Routes and UI use their exported functions.
- History and restore read the data repository's commit log through the store's `log` and `readAt`; the disk backend has neither, and the History page says so.
- Don't hand-edit the configured data branch while the dashboard is live. The store rejects stale writes, but a hand edit can still race it.
- No Supabase. It was removed on purpose; don't reintroduce it.

## Shared logic is client-safe

`lib/projectTypes.ts` holds the types and the rules the UI and the agent API share. It must stay importable from client components (no Node APIs):

- **Readiness:** todo, not snoozed, every `depends_on` task done, every descendant done. Subtasks inherit their ancestors' priority for ordering. A snoozed task is deferred: hidden from Today, My tasks and attention, and not ready for agents, until its day.
- **The attention engine,** which drives the "Needs attention" lists. Snoozed tasks raise nothing until their day.
- **Health:** `projectHealth()` turns stats and attention into on track, at risk, off track, idle or paused, with reasons.
- **Recurrence:** `nextOccurrence()` and `nextOccurrenceAfter()`; the server spawns the next occurrence when a recurring task is finished (without the import `source_key`, snoozed until it is due, always after today even when the task was finished weeks late) and clears the rule on the finished copy. `POST /api/tasks/:id/reopen` undoes a finish in one commit.
- **The Markdown renderers** for `PROJECT.md`, the roadmap and the daily digest.

The same rule applies to `lib/insights.ts` (throughput, cycle time, velocity, forecasts), `lib/quick.ts` (natural-language dates and the capture grammar), `lib/templates.ts` and `lib/ical.ts`. `scripts/unit.mjs` tests them by transpiling the TypeScript in place; add a check there when you change a rule.

## The client layer

`components/CommandLayer.tsx` owns the command palette, quick capture, the shortcut sheet and the `g`-chords, and is mounted in the root layout. Pages with task lists use `components/useListKeys.ts` for `j`/`k` and single-key actions; keep the keys consistent with the sheet in `CommandLayer`. Toasts come from `components/Toast.tsx` (`useToast()`), and destructive actions should offer undo through it (deletes return what was removed; `POST /api/tasks/restore` puts it back; finishing returns `spawned`, and `POST /api/tasks/:id/reopen` undoes it). An undo is one request, so it is one commit. The `g`-chord is shared state in `components/chord.ts`; `useListKeys` is off while a chord is armed. After a write that changes what the palette would find, call `invalidateIndex()`.

Colors are CSS variables (`app/globals.css`) consumed through Tailwind's config; never hard-code a hex color in a component. Both themes must work: check `[data-theme="dark"]` when adding surfaces.

## Agent API

`/api/agent/*` is disabled unless `PM_AGENT_API_ENABLED=true`; when enabled it requires `Authorization: Bearer $PM_AGENT_TOKEN` and an agent label (`X-Agent` or `?agent=`). The shared token is trusted-admin access; labels are not identity. `admin/README.md` lists the endpoints. Invariants:

- Decisions an agent creates are always stored as `proposed`.
- An agent can change only `next_action` on a project.
- `blocked` requires a note.
- `done` is refused while subtasks are open.
- Claims 409 if another agent holds the task or the task isn't ready.
- Agent comments attach to the task's thread (`task_id`), never change status, and are checked against the project (status, enabled agents) like every other agent write; proposals through `/api/agent/inbox` land in the inbox and touch no plan. The owner's comment route may carry a `status` so a reply and an unblock are one commit.
- Anything the store would refuse to read back (duplicate record ids, duplicate task `source_key`s) must be refused on write: restores and spawned occurrences check the whole snapshot (every project and its rows, tracked repositories and the inbox), and a version pulled from history gets the same shape checks as a file the store reads.

`dev-workflows/skills/roadmap/SKILL.md` teaches agents this loop. If you change the API, update the skill and `admin/README.md` with it, and bump the plugin version.

## Verify before pushing

```bash
cd admin
npm run typecheck && npm test && npx next build
node scripts/fake-github.mjs &   # fake GitHub Git Data API on :4010
GITHUB_TOKEN=fake PM_GITHUB_API_URL=http://localhost:4010 PM_DATA_OWNER=o PM_DATA_REPO=r PM_DATA_BRANCH=main \
  PM_AGENT_API_ENABLED=true PM_AGENT_TOKEN=smoke-token npx next start &
npm run smoke                    # agent loop, claim race, parallel writes, recurrence, inbox, undo, history
```

`.github/workflows/admin.yml` runs the same steps in CI. `claude plugin validate ./dev-workflows` checks the plugin. Use fictional names in fixtures and tests.
