# Mythic Labs · Brain Admin

A Next.js app for the Mythic Labs central brain (this repo's plugin marketplace): plan and run everything you're building, work from one daily list, let coding agents take tasks and report back, browse the catalogue, get the install commands, and check the few repos that override your default. It never writes to consuming repos.

**Single-admin, no-login by design.** No database: project data is committed to an explicitly configured private Git repository (see Data below). Keep Vercel Deployment Protection on.

---

## What it does

| Section | What it lets you do |
|---|---|
| **Overview** | The home page: today's plan, inbox and review counts, what only you can do, what needs a decision (blocked, overdue, critical, late milestones, proposed decisions, stalled and quiet work), task flow across agents, projects by status and by health, the brain and repo exceptions, and recent changes. Every number links to the list it counts. |
| **Today** | The daily plan: tasks planned for the day (or carried over), your tasks due by today, and anything you have in progress, with story points against a daily capacity. Pull ready work in, start or finish with keys, send leftovers to tomorrow, end the day in one step, copy the brief as Markdown. |
| **Inbox** | Quick captures (press `c` anywhere) and agent proposals, each with the hints it carried. Sort one into a project and milestone as a task in one commit, or drop it with undo. |
| **My tasks** | Everything only you can do: tasks assigned to @me or noted as an owner step, decisions waiting on your call, agents stuck on a blocker. Each row opens a task map with the steps, links and text to paste. |
| **All tasks** | Every task across every project: preset views (open, ready, in progress, blocked, overdue, due this week, mine, unassigned, done), filters, grouping, sorting, keyboard navigation, multi-select with bulk edits in one commit, delete with undo, and a details panel. The state lives in the URL. |
| **Projects** | Board, list, timeline and calendar views of every project, each with a status, priority, computed health, a next action and a plan. Each project has a plan (milestones, tasks, subtasks, dependencies, estimates, labels, recurrence, drag-and-drop order), a changelog (by hand or imported from merged PRs and commits), a decision log (ADR style), notes, an activity feed with written status updates, a setup tab, and an agent brief. New projects can start from a plan template. **Import from GitHub** adds all your repos in one pass. |
| **Task map** | One page per task with the finish line, steps from the notes, the thread (agent reports and your replies), copy-ready briefs, links mined from the task, connected tasks and your other work. |
| **Review** | The weekly pass: projects least recently reviewed first, each with its next action to confirm, open milestones, attention flags, and an optional status update with a health call. A Get clear checklist covers inbox, overdue, blocked and decisions. |
| **Insights** | Throughput per week, cycle time from claim to done, a landing-date forecast per milestone at the current rate, rollups by assignee and project, and where work is sitting. |
| **History** | The data repository's commit log, filtered to one project, with preview and restore of any earlier version. |
| **Import** | Paste a reviewed `mythic-import-v1` manifest to create project categories, tasks and log entries with stable source keys. |
| **Repos** | Install paths for your machine (user scope) and your organization (claude.ai sync). Below them, track repos that need a different plugin set: toggle chips, **Copy JSON** to commit yourself, and **Check** to compare against what's on GitHub (read-only). |
| **Brain** | Reads `.claude-plugin/marketplace.json` and every plugin manifest in this repo. Browse every skill, agent, command, hook the brain ships. |
| **Authoring** | Three forms: register an MCP server in a plugin, draft a new slash command, or verify a consuming repo's wiring. All commits go straight to the brain repo. |

### Keyboard and capture

`⌘K` (or `/`) opens search and commands across projects, tasks, milestones, decisions, notes and inbox items. `c` opens quick capture. `?` lists every shortcut. `g` then a letter jumps to a page (`g t` Today, `g i` Inbox, `g q` All tasks, `g p` Projects, `g r` Review, `g n` Insights, `g h` History). In task lists, `j` and `k` move, `↵` opens, `d` finishes, `s` starts, and `t` plans a task for today or takes it off today. On Today, `n` moves a task to tomorrow. On All tasks, `x` selects, `b` blocks, `e` edits in place and `p` toggles the details panel. In the Inbox, `↵` adds the item as a task and `⌫` drops it. Shortcuts are off while you type in a field, and the second key of a `g` chord never reaches a list.

Quick capture reads one line the way Todoist and Things do, and shows every recognized token before saving:

```
Fix login redirect #mythic-labs @claude-code !high due:fri ~3 +bug every week tomorrow
```

`#project` (fuzzy; quotes for spaces), `@agent`, `!critical|high|medium|low` or `!!!` or `p1`, `due:<date>`, `plan:<date>` or a trailing date word (the day you will do it), `~3` or `3pt` for points, `+label`, `every day|weekday|week|2 weeks|month|quarter|year`. Dates accept `tomorrow`, `fri`, `next week`, `in 3d`, `nov 5`, `11/5`, `2026-11-05`. Second and later lines become notes. With a project it becomes a task; without one it waits in the Inbox.

Dark mode follows the system; the sidebar toggle saves a choice.

---

## Deploy (one-time setup)

### 1 · Data (no database)

Everything the dashboard stores (projects, plans, logs, tracked repos, captures) lives as files in git in a separately configured private repository:

```
private project data repository / existing branch
├── README.md
├── projects/<id>.json   one project: plan, log, settings (source of truth)
├── projects/<id>.md     the same project as Markdown, for people and agents
├── repos.json           the Repos page's tracked exceptions
├── operations.json      idempotency receipts, kept for 30 days
└── inbox.json           quick captures waiting to be sorted (written on the first capture)
```

Every edit is one commit, so Git history is the audit trail, and the History page reads it back. Set `PM_DATA_OWNER`, `PM_DATA_REPO`, and `PM_DATA_BRANCH` independently of `BRAIN_OWNER` / `BRAIN_REPO`. The app verifies the destination is private before reading or writing, and fails closed when config, branch, or incompatible data files are missing or inaccessible. A validated pre-versioned project-only snapshot remains readable; its missing metadata files are added atomically on the first mutation without changing existing records. Fields added after the first release (estimates, labels, recurrence, threads, review stamps) are optional in stored files and filled with defaults on read. It never initializes an empty branch automatically, so seed a new data repository by hand before the first deploy (see below). Preview deployments may use only `preview/*` branches; production cannot use a preview branch. The server-side `GITHUB_TOKEN` needs existing Contents read/write access to the private data repository. This change does not create or broaden token access.

**Seeding a new data repository.** Create a private repository (for example `mythic-pm-data`), and commit these two files to the branch you will name in `PM_DATA_BRANCH`. With them in place the store reads an empty but valid dataset; without them it refuses to start.

```
repos.json       {"schemaVersion": 1, "repos": [], "plugins": {}}
operations.json  {"schemaVersion": 1, "items": {}}
```

How writes stay safe (`lib/store.ts`): each change reads the branch head, applies the edit, and commits all touched files at once with a non-forced ref update. If someone else committed first, GitHub rejects it (422) and the store re-reads and re-applies, up to 5 tries. Agent claims run their checks inside that loop, so two agents can't both claim a task. Bulk edits, inbox triage, template application and restores are single commits for the same reason. `operations.json` records request idempotency keys in the same commit as the mutation. GitHub changelog imports also deduplicate by `source_url`.

### 2 · GitHub PAT

Use an existing authorized token with:
- **Repository access**: `mythic-labs`, the private project-data repository, plus repos the dashboard must inspect
- **Permissions**: `Contents: read & write` on `mythic-labs` (Authoring) and the private project-data repository; `Contents: read` and `Pull requests: read` on repos used for changelog imports

Save the token; it goes into Vercel env as `GITHUB_TOKEN`.

### 3 · Vercel

Deploy the `admin/` subdirectory:

```bash
# From the mythic-labs repo root:
vercel link    # or use the Vercel MCP server
vercel --cwd admin
```

When configuring the project in Vercel, set the **Root Directory** to `admin/`.

#### Vercel environment variables

Set these in the Vercel project (Settings, Environment Variables). `admin/.env.local.example` has the same list with comments. Supabase was removed in #10, so delete any leftover `SUPABASE_*` or `NEXT_PUBLIC_SUPABASE_*` variables; nothing reads them.

| Variable | Environments | Value |
|---|---|---|
| `GITHUB_TOKEN` | Production, Preview | The fine-grained PAT from step 2. Server-side only. |
| `PM_DATA_OWNER` | Production, Preview | GitHub account that owns the private data repository, e.g. `tennysonmilesperhour`. Owner only, no slash. |
| `PM_DATA_REPO` | Production, Preview | Name of the private data repository, e.g. `mythic-pm-data`. Name only, no slash. Must be private or the app refuses it. |
| `PM_DATA_BRANCH` | Production | The seeded branch, normally `main`. Must not start with `preview/`. |
| `PM_DATA_BRANCH` | Preview | A seeded branch that starts with `preview/`, e.g. `preview/main`. Preview deployments refuse any other branch. |
| `BRAIN_OWNER` | Production, Preview | `tennysonmilesperhour`. Optional: this is the default. |
| `BRAIN_REPO` | Production, Preview | `mythic-labs`. Optional: this is the default. |
| `PM_AGENT_API_ENABLED` | Production | `false` until you decide to let agents use the roadmap API; `true` turns it on. Anything other than the exact string `true` keeps it off. |
| `PM_AGENT_TOKEN` | Production | A long random string, e.g. the output of `openssl rand -hex 32`. Required only when the agent API is enabled; agents send it as their `MYTHIC_PM_TOKEN`. |

Do not set these on Vercel: `PM_DATA_DIR` (local development only; a Vercel deployment with it set refuses to start) and `PM_GITHUB_API_URL` (only for the fake GitHub in the smoke test; `GITHUB_API_URL` is the GitHub Enterprise override). `VERCEL_ENV` is set by Vercel itself.

The dashboard has no login of its own, so keep Vercel Deployment Protection on (Settings, Deployment Protection). If agents call the API, create a Protection Bypass for Automation secret there and give it to them as `MYTHIC_PM_BYPASS`.

### 4 · Calendar feed (optional)

`GET /api/calendar.ics` serves open task due dates, milestone targets and project targets as all-day events; `?mine=1` keeps only your tasks and `?project=<id>` one project. Subscribe to it from Google Calendar or Apple Calendar. Behind Deployment Protection, append `?x-vercel-protection-bypass=<secret>` using the bypass secret from step 3 (calendar clients cannot send headers).

---

## Agent API (autonomous build agents)

The dashboard doubles as the roadmap agents work from. The API is disabled unless `PM_AGENT_API_ENABLED=true` and `PM_AGENT_TOKEN` is configured. Every call needs `Authorization: Bearer <token>` and an agent label (`X-Agent` header or `?agent=`). The shared token authenticates a trusted admin; the caller-supplied label is not per-agent identity or isolation. Do not enable or share this token for the private everything dashboard without separate approval.

| Endpoint | What it does |
|---|---|
| `GET /api/agent/roadmap` | All projects as Markdown (or `?format=json`): status, ready work, attention flags |
| `GET /api/agent/digest` | Today's brief as Markdown: what needs the owner, today's plan, agent work, due soon, recent changes |
| `GET /api/agent/projects/:id` | One project as Markdown with task ids |
| `GET /api/agent/next[?project=]` | Next ready task for this agent, with build instructions, acceptance criteria and active decisions |
| `GET /api/agent/tasks/:id` | One task with its thread (reports and the owner's replies, oldest first), subtasks and what it waits on |
| `POST /api/agent/tasks/:id/claim` | Mark doing and assign. 409 if another agent holds it or it isn't ready |
| `PATCH /api/agent/tasks/:id` | `{status, note}`; blocked needs a note; done is refused while subtasks are open |
| `POST /api/agent/tasks/:id/comments` | `{body}`: a question or checkpoint on the thread without changing status. Checked against the project like every agent write |
| `POST /api/agent/projects/:id/tasks` | Add a subtask or follow-up (title, parent_id, acceptance, estimate, labels, due_date, depends_on) |
| `POST /api/agent/projects/:id/entries` | Changelog, progress, note, or decision (always lands as *proposed*) |
| `POST /api/agent/inbox` | Propose work into the owner's inbox; touches no plan |
| `PATCH /api/agent/projects/:id` | `{next_action}` only |

**Ready** means: todo, not snoozed, every dependency done, every subtask done, in an Active or Building project. Agents take tasks assigned to them, or unassigned tasks in projects that list them (or list no agents). Subtasks inherit their parent's priority for ordering. Finishing a recurring task spawns its next occurrence, snoozed until it is due, so the same chore is not picked up again at once.

The `roadmap` skill in `dev-workflows` teaches any agent this loop. Agents need `MYTHIC_PM_URL` and `MYTHIC_PM_TOKEN` in their environment (plus `MYTHIC_PM_BYPASS` if Vercel Deployment Protection is on; use a Protection Bypass for Automation secret).

### Dashboard routes

The dashboard's own pages and `/api/*` routes are no-auth (single-admin mode), so keep Vercel Deployment Protection on. Beyond the per-item CRUD routes:

| Route | What it does |
|---|---|
| `PATCH /api/tasks` | `{items: [{id, ...patch}]}`: edit many tasks, any projects, in one commit. `DELETE` with `{ids}` removes many and returns them for undo |
| `POST /api/tasks/restore` | `{tasks}`: put deleted tasks back with their original ids |
| `POST /api/tasks/:id/reopen` | `{status?, recurrence?, planned_for?, spawned_id?}`: undo a finish in one commit; with `spawned_id` the occurrence that finishing a recurring task spawned is removed, unless someone has started it |
| `POST /api/tasks/:id/comments` | `{body, status?}`: your reply on a task's thread; with `status` (for example `todo` to unblock) the reply and the change are one commit |
| `POST /api/projects/:id/reorder` | `{order: [{id, milestone_id?, parent_id?}]}`: the plan's new task order |
| `POST /api/projects/:id/template` | `{template, start?}`: lay a plan template's milestones and tasks onto the project (`POST /api/projects` also takes `template`, so a new project and its plan are one commit) |
| `POST /api/projects/:id/review` | `{next_action?, status?, status_note?, update?: {health, body}}`: one review pass in one commit |
| `GET /api/projects/:id/history/:sha` | The project as it was at a commit; `POST` restores it |
| `GET /api/history[?project=]` | Recent commits to the data store |
| `GET` `POST /api/inbox`, `PATCH` `DELETE /api/inbox/:id`, `POST /api/inbox/:id/triage` | Captures and turning one into a task |
| `GET /api/search` | The index the command palette searches |
| `GET /api/calendar.ics` | The calendar feed |
| `GET /api/digest` | Today's brief as Markdown |

For an owner-reviewed inventory import, `POST /api/projects/:id/tasks` also accepts `{ "items": [...] }`. Every task must have a stable `source_key`; existing keys are skipped, and the whole batch is written in one store mutation. Send a stable `Idempotency-Key` for replay safety. A retry with the same key and payload within 30 days replays the original result; the same key with a different payload returns 409. Single-task POSTs keep their existing response and behavior.

---

## Local dev

```bash
cd admin
cp .env.local.example .env.local
# fill in real values, or set PM_DATA_DIR=./.data to keep data on disk with no GitHub writes
npm install
npm run dev
```

Visit http://localhost:3000. With `PM_DATA_DIR` the History page has nothing to show (plain files keep no commit log).

### Checks

```bash
npm run typecheck     # tsc
npm test              # unit checks: capture parser, dates, recurrence, health, insights, calendar feed
npm run build
```

### Testing the store and agent API without a token

`scripts/fake-github.mjs` fakes GitHub's Git Data API (strict about non-fast-forward updates, like the real one, with commit history and file contents). `scripts/smoke.mjs` runs the agent loop, a five-way claim race, a burst of parallel writes, recurrence, bulk edits, undo, inbox triage, threads, history and restore against it.

```bash
node scripts/fake-github.mjs &        # port 4010
GITHUB_TOKEN=fake PM_GITHUB_API_URL=http://localhost:4010 PM_DATA_OWNER=o PM_DATA_REPO=r PM_DATA_BRANCH=main \
  PM_AGENT_API_ENABLED=true PM_AGENT_TOKEN=smoke-token sh -c 'npm run build && npm start' &
npm run smoke                         # expects: all checks passed
```

`.github/workflows/admin.yml` runs the same four steps on every pull request that touches `admin/`. The smoke step sets `PM_GITHUB_API_URL` rather than `GITHUB_API_URL`, which GitHub Actions reserves.

---

## Architecture (short version)

```
admin/
├── app/                          ← Next.js app router pages
│   ├── page.tsx                  ← / overview
│   ├── today/ inbox/ review/     ← the daily and weekly rituals
│   ├── tasks/                    ← /tasks (my tasks) · [id] (task map with thread)
│   ├── queue/                    ← /queue (all tasks: filters, bulk edits, details)
│   ├── projects/                 ← / projects (board, list, timeline, calendar) · [id] (plan, logs, setup, agents)
│   ├── insights/ history/        ← flow metrics · commit log with restore
│   ├── fix/ import/ repos/ brain/ authoring/
│   └── api/
│       ├── agent/*               ← token-protected API for autonomous agents
│       ├── projects/*            ← projects + nested milestones/tasks/entries, reorder, template, history, GitHub activity
│       ├── tasks/*               ← one task, bulk edits, restore, comments
│       ├── inbox/*               ← captures and triage
│       ├── search · history · digest · calendar.ics
│       ├── github/repos · repos/* · marketplace · plugins/[slug] · verify/[owner]/[repo]
│       └── authoring/            ← commits .mcp.json or commands/<name>.md into the brain
├── components/                   ← Sidebar, CommandLayer (palette, capture, shortcuts), Toast, Theme, Markdown, charts
├── lib/
│   ├── store.ts                  ← git-backed data store (GitHub branch, or disk in dev), history
│   ├── db.ts                     ← tracked repos + plugin toggles (repos.json)
│   ├── projects.ts               ← project manager reads and writes (server)
│   ├── projectTypes.ts           ← types, readiness, attention engine, health, Markdown roadmap and digest (client-safe)
│   ├── insights.ts               ← throughput, cycle time, velocity, forecasts (client-safe)
│   ├── quick.ts                  ← natural-language dates and capture parsing (client-safe)
│   ├── templates.ts · ical.ts    ← plan templates · calendar feed (client-safe)
│   ├── api.ts                    ← route helpers, agent auth
│   ├── github.ts                 ← Octokit reads; writes only to the brain repo
│   ├── brain.ts                  ← marketplace + plugin inventory
│   └── settings.ts               ← renders per-repo settings.json (client-safe)
└── scripts/                      ← fake GitHub, smoke test, unit checks
```

**Why this stack:** Next.js gives one repo for UI + API; Vercel deploy is a single command; git as the store means no database to run or pay for, a full history of every change (the History page), and a roadmap any agent can read straight from GitHub.

**Limits of the git store:** a save takes about a second (four GitHub calls), every edit is a commit, and each read lists the whole tree. Comfortable for dozens of projects with hundreds of tasks each. Heavier use would want a real database behind the same `lib/projects.ts` API.

---

## Path to multi-user

Add auth in front (e.g. Auth.js with the GitHub provider, or Vercel's own protection), then record the signed-in user as the author of each change. The commit history already says what changed and when.
