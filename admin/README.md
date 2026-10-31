# Mythic Labs · Brain Admin

A small Next.js app for the Mythic Labs central brain (this repo's plugin marketplace): manage everything you're building, browse the catalogue, get the install commands, and check the few repos that override your default. It never writes to consuming repos.

**Single-admin, no-login by design.** No database: project data is committed to an explicitly configured private Git repository (see Data below). Keep Vercel Deployment Protection on.

---

## What it does

| Section | What it lets you do |
|---|---|
| **Projects** | The at-a-glance hub: a one-line status sentence, **Needs attention** (open critical tasks, blocked, overdue, stalled agent work, decisions waiting on you, quiet projects, missing next actions), what's in progress, and what's due in 14 days. Below that, the project manager for every repo or idea. Toggle each between Active, Building, Planned and Paused (buttons or drag on the board). Board, list and timeline views. Each project has a plan (milestones → tasks → subtasks with checkboxes, status, priority, due dates and an assigned agent), a changelog (log by hand or import merged PRs/commits from GitHub), a decision log (ADR style), notes, an activity feed, assigned agents, connected tools, tags, links, and a Handoff tab that writes an agent brief or a `PROJECT.md`. **Import from GitHub** adds all your repos in one pass. |
| **Repos** | Install paths for your machine (user scope) and your organization (claude.ai sync). Below them, track repos that need a different plugin set: toggle chips, **Copy JSON** to commit yourself, and **Check** to compare against what's on GitHub (read-only). |
| **Brain** | Reads `.claude-plugin/marketplace.json` and every plugin manifest in this repo. Browse every skill, agent, command, hook the brain ships. |
| **Authoring** | Three forms: register an MCP server in a plugin, draft a new slash command, or verify a consuming repo's wiring. All commits go straight to the brain repo. |

---

## Deploy (one-time setup)

### 1 · Data (no database)

Everything the dashboard stores (projects, plans, logs, tracked repos) lives as files in git in a separately configured private repository:

```
private project data repository / existing branch
├── README.md
├── projects/<id>.json   one project: plan, log, settings (source of truth)
├── projects/<id>.md     the same project as Markdown, for people and agents
├── repos.json           the Repos page's tracked exceptions
└── operations.json      durable idempotency receipts
```

Every edit is one commit, so Git history is the audit trail. Set `PM_DATA_OWNER`, `PM_DATA_REPO`, and `PM_DATA_BRANCH` independently of `BRAIN_OWNER` / `BRAIN_REPO`. The app verifies the destination is private before reading or writing, and fails closed when config, branch, or incompatible data files are missing or inaccessible. A validated pre-versioned project-only snapshot remains readable; its missing metadata files are added atomically on the first mutation without changing existing records. It never initializes an empty branch automatically, so seed a new data repository by hand before the first deploy (see below). Preview deployments may use only `preview/*` branches; production cannot use a preview branch. The server-side `GITHUB_TOKEN` needs existing Contents read/write access to the private data repository. This change does not create or broaden token access.

**Seeding a new data repository.** Create a private repository (for example `mythic-pm-data`), and commit these two files to the branch you will name in `PM_DATA_BRANCH`. With them in place the store reads an empty but valid dataset; without them it refuses to start.

```
repos.json       {"schemaVersion": 1, "repos": [], "plugins": {}}
operations.json  {"schemaVersion": 1, "items": {}}
```

How writes stay safe (`lib/store.ts`): each change reads the branch head, applies the edit, and commits all touched files at once with a non-forced ref update. If someone else committed first, GitHub rejects it (422) and the store re-reads and re-applies, up to 5 tries. Agent claims run their checks inside that loop, so two agents can't both claim a task. `operations.json` records request idempotency keys in the same commit as the mutation. GitHub changelog imports also deduplicate by `source_url`.

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

Do not set these on Vercel: `PM_DATA_DIR` (local development only; a Vercel deployment with it set refuses to start) and `GITHUB_API_URL` (only for the fake GitHub in the smoke test). `VERCEL_ENV` is set by Vercel itself.

The dashboard has no login of its own, so keep Vercel Deployment Protection on (Settings, Deployment Protection). If agents call the API, create a Protection Bypass for Automation secret there and give it to them as `MYTHIC_PM_BYPASS`.

---

## Agent API (autonomous build agents)

The dashboard doubles as the roadmap agents work from. The API is disabled unless `PM_AGENT_API_ENABLED=true` and `PM_AGENT_TOKEN` is configured. Every call needs `Authorization: Bearer <token>` and an agent label (`X-Agent` header or `?agent=`). The shared token authenticates a trusted admin; the caller-supplied label is not per-agent identity or isolation. Do not enable or share this token for the private everything dashboard without separate approval.

| Endpoint | What it does |
|---|---|
| `GET /api/agent/roadmap` | All projects as Markdown (or `?format=json`): status, ready work, attention flags |
| `GET /api/agent/projects/:id` | One project as Markdown with task ids |
| `GET /api/agent/next[?project=]` | Next ready task for this agent, with build instructions, acceptance criteria and active decisions |
| `POST /api/agent/tasks/:id/claim` | Mark doing and assign. 409 if another agent holds it or it isn't ready |
| `PATCH /api/agent/tasks/:id` | `{status, note}`; blocked needs a note; done is refused while subtasks are open |
| `POST /api/agent/projects/:id/tasks` | Add a subtask or follow-up |
| `POST /api/agent/projects/:id/entries` | Changelog, progress, note, or decision (always lands as *proposed*) |
| `PATCH /api/agent/projects/:id` | `{next_action}` only |

**Ready** means: todo, every dependency done, every subtask done, in an Active or Building project. Agents take tasks assigned to them, or unassigned tasks in projects that list them (or list no agents). Subtasks inherit their parent's priority for ordering.

The `roadmap` skill in `dev-workflows` teaches any agent this loop. Agents need `MYTHIC_PM_URL` and `MYTHIC_PM_TOKEN` in their environment (plus `MYTHIC_PM_BYPASS` if Vercel Deployment Protection is on; use a Protection Bypass for Automation secret).

For an owner-reviewed inventory import, `POST /api/projects/:id/tasks` also accepts `{ "items": [...] }`. Every task must have a stable `source_key`; existing keys are skipped, and the whole batch is written in one store mutation. Send a stable `Idempotency-Key` for replay safety. A retry with the same key and payload replays the original result; the same key with a different payload returns 409. Single-task POSTs keep their existing response and behavior.

The dashboard's own pages and `/api/*` routes are still no-auth (single-admin mode), so keep Vercel Deployment Protection on.

---

## Local dev

```bash
cd admin
cp .env.local.example .env.local
# fill in real values, or set PM_DATA_DIR=./.data to keep data on disk with no GitHub writes
npm install
npm run dev
```

Visit http://localhost:3000.

### Testing the store and agent API without a token

`scripts/fake-github.mjs` fakes GitHub's Git Data API (strict about non-fast-forward updates, like the real one). `scripts/smoke.mjs` runs the agent loop, a five-way claim race and a burst of parallel writes against it.

```bash
node scripts/fake-github.mjs &        # port 4010
GITHUB_TOKEN=fake GITHUB_API_URL=http://localhost:4010 PM_AGENT_TOKEN=smoke-token \
  sh -c 'npm run build && npm start' &
node scripts/smoke.mjs                # expects: all checks passed
```

---

## Architecture (short version)

```
admin/
├── app/                          ← Next.js app router pages
│   ├── page.tsx                  ← / overview
│   ├── projects/                 ← / projects (board) · [id] (plan, logs, setup, handoff)
│   ├── repos/                    ← / repos · server + ReposClient
│   ├── brain/                    ← / brain
│   ├── authoring/                ← / authoring · AuthoringClient
│   └── api/
│       ├── agent/*               ← token-protected API for autonomous agents
│       ├── projects/*            ← projects + nested milestones/tasks/entries, GitHub activity
│       ├── tasks|milestones|entries/[id] ← edit/delete one item
│       ├── github/repos          ← repos the token can read (project import)
│       ├── repos/*               ← tracked-exception CRUD
│       ├── marketplace/          ← reads brain marketplace.json
│       ├── plugins/[slug]/       ← reads plugin manifest + skills/agents
│       ├── verify/[owner]/[repo] ← inspects consuming repo wiring
│       └── authoring/
│           ├── mcp/              ← commits .mcp.json into a plugin
│           └── command/          ← commits commands/<name>.md
├── components/                   ← Sidebar, LivingCanvas, Glyphs, CopyBlock
├── lib/
│   ├── store.ts                  ← git-backed data store (GitHub branch, or disk in dev)
│   ├── db.ts                     ← tracked repos + plugin toggles (repos.json)
│   ├── projects.ts               ← project manager reads and writes (server)
│   ├── projectTypes.ts           ← types, readiness, attention engine, Markdown roadmap (client-safe)
│   ├── api.ts                    ← route helpers, agent auth
│   ├── github.ts                 ← Octokit reads; writes only to the brain repo
│   ├── brain.ts                  ← marketplace + plugin inventory
│   └── settings.ts               ← renders per-repo settings.json (client-safe)
└── scripts/                      ← fake GitHub + smoke test
```

**Why this stack:** Next.js gives one repo for UI + API; Vercel deploy is a single command; git as the store means no database to run or pay for, a full history of every change, and a roadmap any agent can read straight from GitHub.

**Limits of the git store:** a save takes about a second (four GitHub calls), every edit is a commit, and each read lists the whole tree. Comfortable for dozens of projects with hundreds of tasks each. Heavier use would want a real database behind the same `lib/projects.ts` API.

---

## Path to multi-user

Add auth in front (e.g. Auth.js with the GitHub provider, or Vercel's own protection), then record the signed-in user as the author of each change. The commit history already says what changed and when.
