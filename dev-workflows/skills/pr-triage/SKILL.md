---
name: pr-triage
description: Triage an open pull request — surface CI status, unresolved review threads, merge conflicts, and stale-since-last-review state. Use when the user asks "what's the status of PR X" or "is anything blocking this." Returns a punch list, not narrative prose.
---

# PR Triage

Quickly answer: **is this PR mergeable, and if not, what's blocking it?**

## Inputs

- A PR number (or URL), or current branch's open PR if none specified
- Repository defaults to the current working repo

## Procedure

1. `pull_request_read` with method `get` — basic state
2. `pull_request_read` with method `get_status` — CI summary
3. `pull_request_read` with method `get_check_runs` — individual checks
4. `pull_request_read` with method `get_review_comments` — unresolved threads only
5. `pull_request_read` with method `get_reviews` — approval state

Run all five in parallel when possible.

## Output Format

```
PR #<n> · <title>
─────────────────
State:        open / draft / merged
Mergeable:    yes / no — <reason if no>
Behind base:  <n> commits

CI
──
✓ <check> — passed
✗ <check> — failed: <one-line reason>
… <check> — pending

REVIEW
──────
Approvals:    <n>
Changes req:  <n>
Unresolved:   <n threads>
  ▸ <file>:<line> — <commenter>: <gist>

BLOCKERS (priority order)
─────────────────────────
1. <thing to fix first>
2. <thing to fix second>
```

## Guardrails

- Don't include resolved review threads.
- Don't summarize the PR diff unless asked.
- If everything is green, just say so in two lines.
