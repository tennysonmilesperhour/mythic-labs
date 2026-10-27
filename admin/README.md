# Mythic Labs · Brain Admin

A small Next.js app for the Mythic Labs central brain (this repo's plugin marketplace): manage everything you're building, browse the catalogue, get the install commands, and check the few repos that override your default. It never writes to consuming repos.

**Single-admin, no-login by design.** No database: data is committed to a git branch (see Data below).

---

## What it does

| Section | What it lets you do |
|---|---|
| **Projects** | The at-a-glance hub: a one-line status sentence, **Needs attention** (blocked, overdue, stalled agent work, decisions waiting on you, quiet projects, missing next actions), what's in progress, and what's due in 14 days. Below that, the project manager for every repo or idea. Toggle each between Active, Building, Planned and Paused (buttons or drag on the board). Board, list and timeline views. Each project has a plan (milestones → tasks → subtasks with checkboxes, status, priority, due dates and an assigned agent), a changelog (log by hand or import merged PRs/commits from GitHub), a decision log (ADR style), notes, an activity feed, assigned agents, connected tools, tags, links, and a Handoff tab that writes an agent brief or a `PROJECT.md`. **Import from GitHub** adds all your repos in one pass. |
| **Repos** | Install paths for your machine (user scope) and your organization (claude.ai sync). Below them, track repos that need a different plugin set: toggle chips, **Copy JSON** to commit yourself, and **Check** to compare against what's on GitHub (read-only). |
| **Brain** | Reads `.claude-plugin/marketplace.json` and every plugin manifest in this repo. Browse every skill, agent, command, hook the brain ships. |
| **Authoring** | Three forms: register an MCP server in a plugin, draft a new slash command, or verify a consuming repo's wiring. All commits go straight to the brain repo. |

---

## Deploy (one-time setup)

### 1 · Data (no database)

Everything the dashboard stores (projects, plans, logs, tracked repos) lives as files in git:

```
roadmap-data branch of the brain repo   (created on first write)
├── README.md
├── projects/<id>.json   one project: plan, log, settings (source of truth)
├── projects/<id>.md     the same project as Markdown, for people and agents
└── repos.json           the Repos page's tracked exceptions
```

Every edit is one commit, so `git log roadmap-data` is the audit trail. The branch carries its own `vercel.json` with deployments off (and `admin/vercel.json` on main excludes it too), so data commits never trigger Vercel builds. To keep the data elsewhere, set `PM_DATA_REPO=owner/repo` and/or `PM_DATA_BRANCH`. The token needs Contents read & write there.

How writes stay safe (`lib/store.ts`): each change reads the branch head, applies the edit, and commits all touched files at once with a non-forced ref update. If someone else committed first, GitHub rejects it (422) and the store re-reads and re-applies, up to 5 tries. Agent claims run their checks inside that loop, so two agents can't both claim a task.

### 2 · GitHub PAT

Create a fine-grained Personal Access Token with:
- **Repository access**: `mythic-labs`, plus any repo you want **Check** to read or track in **Projects** (its changelog importer reads PRs and commits)
- **Permissions**: `Contents: read & write` on `mythic-labs` (Authoring and the roadmap data commit there); `Contents: read` and `Pull requests: read` everywhere else

Save the token; it goes into Vercel env as `GITHUB_TOKEN`.

### 3 · Vercel

Deploy the `admin/` subdirectory:

```bash
# From the mythic-labs repo root:
vercel link    # or use the Vercel MCP server
vercel --cwd admin
```

When configuring the project in Vercel, set the **Root Directory** to `admin/`.

Add env vars (see `admin/.env.local.example`):

```
GITHUB_TOKEN=ghp_...
BRAIN_OWNER=tennysonmilesperhour
BRAIN_REPO=mythic-labs
PM_AGENT_TOKEN=<long random string>   # turns on the agent API
```

---

## Agent API (autonomous build agents)

The dashboard doubles as the roadmap agents work from. Set `PM_AGENT_TOKEN` (e.g. `openssl rand -hex 32`) to turn it on; every call needs `Authorization: Bearer <token>` and the agent's name (`X-Agent` header or `?agent=`).

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
