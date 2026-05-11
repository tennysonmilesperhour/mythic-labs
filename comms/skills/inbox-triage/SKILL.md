---
name: inbox-triage
description: Triage the Gmail inbox into action-required vs. read-later vs. archivable. Use when the user asks to "check my email," "what needs a response," or "clear my inbox." Returns a prioritized list with suggested draft replies for high-priority items — never sends without confirmation.
---

# Inbox Triage

Cut through inbox volume and surface only what genuinely needs the user's attention.

## Procedure

1. `search_threads` for recent unread threads (default: last 24 hours; ask user to widen if needed)
2. For each thread, fetch the latest message via `get_thread`
3. Classify into:
   - **ACTION** — needs a substantive reply or decision
   - **AWAIT** — waiting on someone else; just track
   - **READ** — informational, low priority
   - **ARCHIVE** — newsletters, receipts, automated noise

## Output Format

```
INBOX TRIAGE — last <window>
═══════════════════════════
Total threads: <n>  ·  Action-required: <n>

ACTION
──────
▸ <sender> · <subject>
  Why:       <one-line>
  Suggested: <one-line reply gist>

▸ <sender> · <subject>
  Why:       <one-line>
  Suggested: <one-line reply gist>

AWAIT
─────
▸ <sender> · <subject> — waiting on <whom>

READ LATER
──────────
▸ <sender> · <subject>

ARCHIVE CANDIDATES (<n>)
─────────────────────────
(grouped by sender pattern)
```

## Guardrails

- **Never send a reply** without the user explicitly confirming each one.
- Drafts via `create_draft` are fine — they're not sent.
- If the user asks to bulk-archive, confirm the count before acting.
- Never paraphrase a thread in a way that loses commitments or numbers.
