---
name: thought-capture
description: Save a passing insight, reference, or idea to the persistent thought store so it survives this session. Use when the user says "remember this," "save this thought," "put this in my second brain," or when something worth keeping surfaces mid-conversation. Also retrieves prior thoughts on a topic when asked "what did I think about X."
---

# Thought Capture

Persistent memory across sessions. Two modes: write and recall.

## Capture mode

When the user says "save this" or you detect a worth-keeping insight:

1. `capture_thought` with:
   - The thought itself (verbatim where possible — don't paraphrase the user's wording away)
   - Tags inferred from context (project, topic, archetype, etc.)
   - A link back to the source artifact if one exists
2. Confirm capture with the thought ID

## Recall mode

When the user asks "what did I think about X" or "have I noted anything on Y":

1. `search_thoughts` with the query — tune up to 10 results
2. Order by recency + relevance
3. Return as a chronological list with snippet + tags

## Output Format (recall)

```
THOUGHT RECALL — <query>
════════════════════════
Found: <n>

<date> · #<tag> #<tag>
▸ <verbatim or near-verbatim snippet>
  Source: <where it came from>
  ID: <thought-id>

<date> · #<tag>
▸ <snippet>
  ID: <thought-id>
```

## Capture format

```
CAPTURED
────────
Thought:  <verbatim>
Tags:     #<tag> #<tag>
ID:       <id>
```

## Guardrails

- Verbatim > paraphrase. The user's wording often *is* the insight.
- Tag conservatively — over-tagging makes recall noisy.
- If a thought is a duplicate of something recent, ask before capturing.
- Periodically (when asked) run `thought_stats` to summarize the corpus shape.
