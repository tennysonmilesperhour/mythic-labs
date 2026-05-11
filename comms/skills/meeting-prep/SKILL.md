---
name: meeting-prep
description: Prepare a one-page brief for an upcoming calendar event — who, what, prior context from email threads, open items, and suggested talking points. Use when the user asks "prep me for my next meeting" or specifies an event. Pulls from Gmail + Calendar.
---

# Meeting Prep

Compile a one-page brief so the user walks in with full context.

## Procedure

1. `list_events` for the next 24 hours (or the user-specified window)
2. For the target event, extract: attendees, agenda (if any), title
3. For each attendee, `search_threads` for recent conversation
4. Identify open commitments, last-touched topics, and any unresolved questions
5. Assemble the brief

## Output Format

```
MEETING BRIEF
═════════════
Title:    <event title>
When:     <local time>
With:     <attendees>
Location: <physical / link>

CONTEXT
───────
<2-sentence summary of the relationship state>

RECENT THREADS (last 30 days)
─────────────────────────────
▸ <date> · <subject>
  <one-line gist + any commitment made>

OPEN ITEMS
──────────
□ <thing the user owes them>
□ <thing they owe the user>

SUGGESTED OPENINGS
──────────────────
▸ <natural-sounding entry point #1>
▸ <natural-sounding entry point #2>

QUESTIONS TO ASK
────────────────
? <unresolved thing worth surfacing>
```

## Guardrails

- Keep brief under one screen. If a topic needs more depth, link out.
- Don't fabricate context — if email history is thin, say so.
- Never quote a thread verbatim in a way that would feel surveilled if seen.
