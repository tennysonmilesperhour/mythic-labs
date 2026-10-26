# Mythic Labs · Brain Admin

A small Next.js app for the Mythic Labs central brain (this repo's plugin marketplace): manage everything you're building, browse the catalogue, get the install commands, and check the few repos that override your default. It never writes to consuming repos.

**Single-admin, no-login by design.** Multi-user is a future add (Supabase auth).

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

### 1 · Supabase

In your Supabase project SQL editor, run:

```
admin/supabase/migrations/0001_initial_schema.sql
admin/supabase/migrations/0002_project_manager.sql
admin/supabase/migrations/0003_agent_roadmap.sql
```

0001 creates `mythic_users`, `mythic_repos`, `mythic_repo_plugins` and seeds a hardcoded admin user. 0002 adds the project manager: `mythic_projects`, `mythic_milestones`, `mythic_tasks`, `mythic_project_entries`. 0003 adds what agents need: build instructions per project, acceptance criteria and dependencies per task, claim times, and attributed progress entries. All three are safe to re-run.

Note the project URL and these two keys:
- **Publishable key** (anon, safe to expose) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Service role key** (server-only) → `SUPABASE_SERVICE_ROLE_KEY`

### 2 · GitHub PAT

Create a fine-grained Personal Access Token with:
- **Repository access**: `mythic-labs`, plus any repo you want **Check** to read or track in **Projects** (its changelog importer reads PRs and commits)
- **Permissions**: `Contents: read & write` on `mythic-labs` (Authoring commits there); `Contents: read` and `Pull requests: read` everywhere else

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
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_USER_ID=00000000-0000-0000-0000-000000000001
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
# fill in real values
npm install
npm run dev
```

Visit http://localhost:3000.

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
│       ├── repos/*               ← tracked-exception CRUD (Supabase only)
│       ├── marketplace/          ← reads brain marketplace.json
│       ├── plugins/[slug]/       ← reads plugin manifest + skills/agents
│       ├── verify/[owner]/[repo] ← inspects consuming repo wiring
│       └── authoring/
│           ├── mcp/              ← commits .mcp.json into a plugin
│           └── command/          ← commits commands/<name>.md
├── components/                   ← Sidebar, LivingCanvas, Glyphs, CopyBlock
├── lib/
│   ├── supabase.ts               ← service-role client factory
│   ├── db.ts                     ← typed repo + plugin queries
│   ├── projects.ts               ← project manager queries (server)
│   ├── projectTypes.ts           ← types, readiness, attention engine, Markdown roadmap (client-safe)
│   ├── api.ts                    ← route helpers, agent auth
│   ├── github.ts                 ← Octokit reads; writes only to the brain repo
│   ├── brain.ts                  ← marketplace + plugin inventory
│   └── settings.ts               ← renders per-repo settings.json (client-safe)
└── supabase/migrations/          ← SQL schema
```

**Why this stack:** Next.js gives one repo for UI + API; Vercel deploy is a single command (and you have MCP access); Supabase is already authorized through MCP and gives you a clean path to multi-user later.

---

## Path to multi-user

When ready:

1. Enable Supabase Auth (GitHub provider — already integrated with PATs)
2. Drop the seeded `users` row and FK `repos.user_id` → `auth.users(id)`
3. Replace `ADMIN_USER_ID` lookups with `auth.uid()` from the session
4. Switch the API routes from service-role client to authenticated user client
5. Update RLS policies to `auth.uid() = user_id`

Nothing about the UI or the marketplace structure has to change.
