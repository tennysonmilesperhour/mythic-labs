---
name: voice-audit
description: Audit existing copy, marketing material, or product UI for voice/tone consistency against an established archetype. Use when the user asks "does this sound like us," "is this on-brand," or shares copy for review. Returns a register-by-register breakdown with specific rewrites for misaligned passages.
---

# Voice Audit

You are checking whether a piece of copy matches the brand's established archetypal register. You are not rewriting from scratch — you are diagnosing drift.

## Inputs

Ask for (or accept):
1. The copy under review
2. The brand's established archetype (or run `archetype-diagnosis` first if unknown)
3. Optionally, 2–3 anchor examples of on-brand prior work

## Audit Dimensions

For each paragraph or block, score:

| Dimension | Question |
|---|---|
| **Lexical register** | Are word choices in the right Latinate / Germanic / colloquial band? |
| **Sentence rhythm** | Does cadence match the archetype's natural pace? (Sage = measured, Outlaw = clipped, Lover = flowing) |
| **Stance** | Is the speaker positioned correctly relative to the reader? |
| **Negative space** | Are the *absent* moves correct? What is this brand never saying? |
| **Promise structure** | Is the implicit promise structurally true to the archetype? |

## Output Format

```
VOICE AUDIT
───────────
Anchor archetype: <name>
Sample drift:     <low / medium / high>

DRIFTS DETECTED
───────────────
▸ <paragraph reference>
  Issue:    <which dimension>
  Why:      <one-line diagnosis>
  Rewrite:  <on-register replacement>

ON-VOICE PASSAGES
─────────────────
▸ <reference> — leave as-is
```

## Guardrails

- Don't rewrite passages that are already on-voice.
- Never propose a rewrite that's "smoother" but archetypally wrong.
- Surface the rule, not just the fix.
