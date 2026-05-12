# Mythic Labs · Central Brain

This repository is a **Claude Code plugin marketplace** as well as a brand site. It hosts reusable skills, subagents, hooks, and MCP integrations that any other repo can pull from on demand.

The goal is a single source of truth for tools/methods, with **per-repo opt-in** and **near-zero token cost** for anything not enabled.

---

## Layout

```
mythic-labs/
├── .claude-plugin/
│   └── marketplace.json          ← catalog read by /plugin marketplace add
│
├── brand-systems/                ← plugin: archetypal brand work
│   ├── .claude-plugin/plugin.json
│   ├── skills/<name>/SKILL.md
│   ├── agents/<name>.md
│   └── commands/<name>.md
│
├── dev-workflows/                ← plugin: engineering ops
│   ├── .claude-plugin/plugin.json
│   ├── skills/<name>/SKILL.md
│   └── hooks/hooks.json
│
├── content-ops/                  ← plugin: design + site building
├── comms/                        ← plugin: inbox + calendar
├── research/                     ← plugin: literature + thought store
│
├── templates/
│   └── consuming-repo.settings.json   ← paste into other repos
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

### Writing a new subagent

Same pattern, in `agents/<name>.md`. Optionally declare `tools:` to restrict the agent's allowlist.

### Adding a hook

Edit `<plugin>/hooks/hooks.json`. Hooks fire on harness events (`PostToolUse`, `PreToolUse`, `SessionStart`, etc.) and never enter the model's context — perfect for guardrails and notifications.

### Adding MCP servers

If a plugin bundles MCP servers (e.g. `dev-workflows` could ship GitHub MCP defaults), place a `.mcp.json` at the plugin root. Consuming repos inherit it when the plugin is enabled.

---

## How other repos consume this

In any consuming repo, drop this at `.claude/settings.json` (or copy from `templates/consuming-repo.settings.json`):

```json
{
  "extraKnownMarketplaces": {
    "mythic-brain": {
      "source": {
        "source": "github",
        "repo": "tennysonmilesperhour/mythic-labs"
      }
    }
  },
  "enabledPlugins": {
    "dev-workflows@mythic-brain": true,
    "brand-systems@mythic-brain": false
  }
}
```

Flip values to control which plugins load **per repo**. Disabled plugins cost **zero tokens**.

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
- Tests for skills are best done by invoking them in a real session in a consuming repo. There's no unit-test substitute for "did Claude actually reach for this when it should have."
- Bump `version` in `plugin.json` when behavior changes meaningfully.

---

## What lives where

- **Public brand site** → `mythic_labs_landing.html`
- **Capability diagnostic** (this session's tools/skills snapshot) → `showcase.html`
- **Brand manifesto** → `README.md`
- **Plugin source** → top-level plugin directories (`brand-systems/`, etc.)
- **Marketplace catalog** → `.claude-plugin/marketplace.json`
- **Consuming-repo template** → `templates/consuming-repo.settings.json`
