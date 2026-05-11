---
name: branch-readiness
description: Audit what's left on the current branch before it can ship. Checks uncommitted changes, commits ahead of base, test presence, CI-relevant file changes, and known release gates. Use when the user asks "what's left before this can ship" or "is this ready to merge."
---

# Branch Readiness

A punch list of what's done vs. what's missing before this branch is shippable.

## Checks

Run these in parallel:

1. `git status --porcelain` — uncommitted work
2. `git log --oneline <base>..HEAD` — commits since base (base = main unless told otherwise)
3. `git diff --name-only <base>..HEAD` — files touched
4. Look for related tests in the touched paths
5. Look for changes to `package.json`, `requirements.txt`, schema files, migration dirs, CI config
6. Check for feature-flag references in new code that may need wiring

## Output Format

```
BRANCH READINESS — <branch>
═══════════════════════════
Base:           <branch>
Commits ahead:  <n>
Files changed:  <n>

DONE
────
✓ <accomplishment>
✓ <accomplishment>

MISSING
───────
✗ <gap>
✗ <gap>

NEEDS CONFIRMATION
──────────────────
? <thing the user must verify manually>
```

## Guardrails

- Don't run tests yourself — flag presence/absence only.
- Don't propose fixes inline; produce the list first, then offer.
- If the branch is clean and complete, say so in two lines.
