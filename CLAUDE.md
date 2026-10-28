# Mythic Labs · Central Brain

This repository is a **Claude Code plugin marketplace** as well as a brand site. It hosts reusable skills, subagents, hooks, and MCP integrations that any other repo can pull from on demand. Skills use the open SKILL.md format, so Codex, Cursor and other agents use them too; `AGENTS.md` briefs those agents.

The goal is a single source of truth for tools/methods: **enabled once** at user or organization scope, with **per-repo overrides** only for exceptions, and **near-zero token cost** for anything not enabled.

---

## Layout

```
mythic-labs/
├── .claude-plugin/
│   └── marketplace.json          ← catalog read by /plugin marketplace add
│
├── brand-systems/                ← plugin: the Mythic Labs method
│   ├── .claude-plugin/plugin.json
│   ├── skills/<name>/SKILL.md    ← archetype-diagnosis, brand-architecture,
│   │                               shadow-analysis, unified-expression, voice-audit
│   ├── agents/<name>.md
│   ├── commands/<name>.md        ← /brand-systems:diagnose, /brand-systems:method
│   └── evals/<case>/             ← claude plugin eval suite (results/ is gitignored)
│
├── dev-workflows/                ← plugin: engineering ops
│   ├── .claude-plugin/plugin.json
│   ├── skills/<name>/SKILL.md    ← branch-readiness, pr-triage, roadmap
│   ├── hooks/hooks.json
│   └── evals/<case>/
│
├── content-ops/                  ← plugin: design + site building
├── comms/                        ← plugin: inbox + calendar
├── research/                     ← plugin: literature + thought store
│
├── templates/
│   └── consuming-repo.settings.json   ← per-repo override template
│
├── admin/                        ← Next.js dashboard (projects, catalogue, install paths, drift check)
│
├── README.md                     ← brand manifesto
├── mythic_labs_landing.html      ← public landing
└── showcase.html                 ← capability diagnostic page
```

---

## Plugin conventions

Each top-level plugin directory follows the same shape:

| Path inside the plugin | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest (name, version, description) |
| `skills/<name>/SKILL.md` | Skills. Frontmatter `description` is always-loaded; body loads on invocation. |
| `agents/<name>.md` | Subagents. Same frontmatter pattern. |
| `commands/<name>.md` | Slash commands. Invoked as `/<plugin-name>:<command>`. |
| `hooks/hooks.json` | Hooks. Run by the harness — zero context cost. |
| `.mcp.json` | MCP server declarations bundled with the plugin. |

### Writing a new skill

Make the directory and `SKILL.md`:

```
plugin-name/skills/your-skill/SKILL.md
```

Frontmatter must include `name` and `description`. The description is what's always in context, so write it for *trigger fidelity* — when should Claude reach for this?

```yaml
---
name: your-skill
description: One sharp sentence covering WHAT it does and WHEN to use it. Include trigger phrases the user might say.
---
```

Below the frontmatter, document the procedure, output format, and guardrails. Keep bodies tight — they're loaded into context once invoked.

**Keep skills portable.** `SKILL.md` is the open Agent Skills format, read by Codex, Cursor, Copilot, and others as well as Claude. To stay portable:

- Use only `name` and `description` in frontmatter (the spec also allows `license`, `compatibility`, `metadata`, `allowed-tools`). `name` is lowercase letters, digits, and hyphens, matching the directory; `description` is at most 1024 characters.
- Keep each skill self-contained. Put supporting files in the skill's own directory and refer to them by bare filename. Don't reference another skill's files with `../`, and don't rely on `${CLAUDE_PLUGIN_ROOT}` in skill bodies — it only expands in Claude Code.

### Writing a new subagent

Same pattern, in `agents/<name>.md`. Optionally declare `tools:` to restrict the agent's allowlist.

### Adding a hook

Edit `<plugin>/hooks/hooks.json`. Hooks fire on harness events (`PostToolUse`, `PreToolUse`, `SessionStart`, etc.) and never enter the model's context — perfect for guardrails and notifications.

### Adding MCP servers

If a plugin bundles MCP servers (e.g. `dev-workflows` could ship GitHub MCP defaults), place a `.mcp.json` at the plugin root. Consuming repos inherit it when the plugin is enabled.

---

## How other repos consume this

Enable the brain once; every repo inherits it. Nothing needs to be committed to consuming repos.

**1. Your machine (user scope).** Run once per machine:

```bash
claude plugin marketplace add tennysonmilesperhour/mythic-labs
claude plugin install brand-systems@mythic-brain --scope user
```

**2. Your organization (Team/Enterprise).** An owner adds this repo under claude.ai Organization settings → Plugins & skills → Add → Sync from GitHub and sets default access (Installed by default or Required). Members get it in Claude Code when signed in with claude.ai; synced plugins load as `<name>@synced`.

**3. Per-repo exceptions.** Only when a repo needs a different plugin set, commit `.claude/settings.json` (start from `templates/consuming-repo.settings.json`, or use **Copy JSON** in the dashboard). Precedence for `enabledPlugins` is user < project < local < managed, so the repo file overrides your user default. Disabled plugins cost **zero tokens**.

The dashboard never writes to consuming repos. Its **Check** button only reads a repo's settings file and reports drift.

---

## Token economics

Claude Code uses **progressive disclosure**. With this brain setup:

| Component | Always-on cost | On-demand cost |
|---|---|---|
| Skill description (enabled) | ~10–30 tokens | full body loads on invocation |
| Skill description (disabled) | **0** | n/a |
| Agent description (enabled) | ~10–30 tokens | full body on delegation |
| Hook | **0** (runs as shell, never enters context) | n/a |
| MCP tool list | tool names only | tool *schemas* deferred — load via `ToolSearch` when needed |

So if a consuming repo enables `dev-workflows` only, the always-on cost is roughly **the sum of skill/agent descriptions in that one plugin** — typically a few hundred tokens. The rest of the brain is dormant.

---

## Adding a new plugin to the brain

1. Create `<plugin-name>/.claude-plugin/plugin.json` with name/version/description.
2. Add skills/agents/commands/hooks under the plugin directory.
3. Register the plugin in `.claude-plugin/marketplace.json` with a `source: "./<plugin-name>"` entry.
4. Commit and push. Consuming repos pick it up the next time their session refreshes the marketplace.

---

## Working in this repo

When editing inside `mythic-labs` itself:

- Treat **skills as the public API** — their `description` field is contractual; consuming sessions decide whether to invoke based on it.
- Keep skill bodies under ~150 lines. If a skill needs more, break it up or move detail into supporting files in the skill directory (these load only when the skill itself loads).
- Bump `version` in `plugin.json` when behavior changes meaningfully.

### Testing skills with evals

Plugins with an `evals/` directory are tested with `claude plugin eval`. Each case is `evals/<case>/prompt.md` (a realistic request that doesn't name the skill) plus graders in `evals/<case>/graders/*.md`. Every new or changed skill should have:

- a **trigger** grader — `type: tool_used`, `tool: Skill`, `input_match` naming the skill
- an **outcome** grader — `regex` for structure, `llm` with concrete PASS/FAIL conditions for judgment
- where routing could go wrong, a **must-not-fire** grader — `min: 0`, `max: 0`, `arm: both`

Use fictional brands in fixtures. Never characterize a real company in a test.

```bash
# Iterate on one case, one run, no baseline (cheap)
claude plugin eval ./brand-systems --case <case> --runs 1 --ablation none --no-publish

# Full run with the no-plugin baseline (shows what the plugin adds, as Δ)
claude plugin eval ./brand-systems --no-publish

# CI gate (not wired up yet — needs an API key secret)
claude plugin eval ./brand-systems --trust-plugin --threshold 0.8 \
  --json results.json --no-publish --max-cost-usd 20
```

Results land in `evals/results/` (gitignored). Validate structure separately with `claude plugin validate ./brand-systems`.

---

## What lives where

- **Public brand site** → `mythic_labs_landing.html`
- **Capability diagnostic** (this session's tools/skills snapshot) → `showcase.html`
- **Brand manifesto** → `README.md`
- **Plugin source** → top-level plugin directories (`brand-systems/`, etc.)
- **Marketplace catalog** → `.claude-plugin/marketplace.json`
- **Per-repo override template** → `templates/consuming-repo.settings.json`
- **Dashboard** → `admin/` (deployed on Vercel)
- **Project manager** (status, plans, changelogs, decisions across all repos) → `admin/app/projects/`; data is committed as files to a private repo (`PM_DATA_REPO`) by `admin/lib/store.ts` (no database)
- **Agent roadmap API** → `admin/app/api/agent/`; the skill agents use to work from it → `dev-workflows/skills/roadmap/`
- **Skill evals** → `<plugin>/evals/`
