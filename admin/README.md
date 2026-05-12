# Mythic Labs · Brain Admin

A small Next.js app that manages which of your other repos consume the Mythic Labs central brain (this repo's plugin marketplace).

**Single-admin, no-login by design.** Multi-user is a future add (Supabase auth).

---

## What it does

| Section | What it lets you do |
|---|---|
| **Repos** | Paste a list of `owner/repo` URLs. Toggle which plugins each repo should load. Click **Apply** and the dashboard writes `.claude/settings.json` directly to that repo via GitHub. |
| **Brain** | Reads `.claude-plugin/marketplace.json` and every plugin manifest in this repo. Browse every skill, agent, command, hook the brain ships. |
| **Authoring** | Three forms: register an MCP server in a plugin, draft a new slash command, or verify a consuming repo's wiring. All commits go straight to the brain repo. |

---

## Deploy (one-time setup)

### 1 · Supabase

In your Supabase project SQL editor, run:

```
admin/supabase/migrations/0001_initial_schema.sql
```

That creates `users`, `repos`, `repo_plugins` and seeds a hardcoded admin user.

Note the project URL and these two keys:
- **Publishable key** (anon, safe to expose) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Service role key** (server-only) → `SUPABASE_SERVICE_ROLE_KEY`

### 2 · GitHub PAT

Create a fine-grained Personal Access Token with:
- **Repository access**: every repo you want to manage from the dashboard
- **Permissions**: `Contents: read & write`

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
```

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
│   ├── repos/                    ← / repos · server + ReposClient
│   ├── brain/                    ← / brain
│   ├── authoring/                ← / authoring · AuthoringClient
│   └── api/
│       ├── repos/*               ← CRUD + apply settings.json
│       ├── marketplace/          ← reads brain marketplace.json
│       ├── plugins/[slug]/       ← reads plugin manifest + skills/agents
│       ├── verify/[owner]/[repo] ← inspects consuming repo wiring
│       └── authoring/
│           ├── mcp/              ← commits .mcp.json into a plugin
│           └── command/          ← commits commands/<name>.md
├── components/Sidebar.tsx
├── lib/
│   ├── supabase.ts               ← service-role client factory
│   ├── db.ts                     ← typed repo + plugin queries
│   ├── github.ts                 ← Octokit reads/writes
│   └── brain.ts                  ← marketplace + plugin inventory
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
