---
name: literature-scan
description: Quickly survey academic literature on a topic. Returns 5-10 most-relevant articles with one-line abstracts, citation strings, and a synthesized "state of the field" paragraph. Use when the user asks "what does the research say about X" or "find me papers on Y."
---

# Literature Scan

Compact, citation-grounded answer to "what does the research say."

## Procedure

1. `search_articles` with the user's query — tune up to 20 results
2. Filter for relevance + recency (default: last 5 years unless user says otherwise)
3. For the top 5–10, fetch metadata
4. Look for related work via `find_related_articles` on the most-cited result
5. Synthesize a brief state-of-field paragraph from titles + abstracts only — do not fabricate findings from titles alone

## Output Format

```
LITERATURE SCAN — <topic>
═════════════════════════
Query:     <as-issued>
Window:    <year range>
Results:   <n>

STATE OF THE FIELD
──────────────────
<2-3 sentence synthesis, grounded only in what abstracts confirm>

KEY ARTICLES
────────────
[1] <Author et al., Year>. <Title>. <Journal>.
    Why: <one-line relevance>
    Citation: <formatted citation string>

[2] <Author et al., Year>. <Title>. <Journal>.
    Why: <one-line relevance>
    Citation: <formatted citation string>

OPEN QUESTIONS / GAPS
─────────────────────
▸ <thing the literature seems not to address>
```

## Guardrails

- Never claim a paper "found X" if you've only seen the title.
- Mark inferences from abstracts vs. inferences from full text.
- If results are scant, return fewer items rather than padding.
- Offer to fetch full text via `get_full_text_article` for any item the user wants deeper.
