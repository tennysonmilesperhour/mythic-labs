---
name: shadow-analysis
description: Find where a brand's archetypal shadow leaks into its product, copy, or culture: the failure mode of its own strength. Use when someone asks "what's the dark side of our brand," "where could this go wrong," "why does our messaging feel manipulative or preachy," "what are our brand risks," or is reviewing cancellation flows, pricing, error states, or crisis communication for tone. Returns detected leaks with severity, the repressed opposite archetype, and integration moves. Needs a known foundational archetype.
---

# Shadow Analysis: Shadow & Light

Every archetype's gift has a shadow form. Brands leak shadow under pressure:
growth targets, retention goals, competition, crisis. Shadow is a structural
risk that grows with the strength of the archetype. It says nothing about the
brand's morals.

Use alongside the three-phase method, usually between Phase 02
(`brand-architecture`) and Phase 03 (`unified-expression`).

## Shadow forms

| Archetype | Gift | Shadow leaks as |
|---|---|---|
| Innocent | Optimism | Denial of real risk, infantilizing users |
| Explorer | Autonomy | Aimlessness, alienating people who want to belong |
| Sage | Clarity | Condescension, cold detachment, analysis paralysis |
| Hero | Courage | Arrogance, manufactured enemies, burnout as a virtue |
| Outlaw | Liberation | Contempt for customers who "conform," destruction for its own sake |
| Magician | Transformation | Overpromising, manipulation, opaque mechanisms |
| Everyman | Belonging | Blandness, self-erasure, race-to-the-bottom pricing |
| Lover | Passion | Desire-based manipulation, people-pleasing, scarcity games |
| Jester | Joy | Cruelty dressed as humor, levity when stakes are real |
| Caregiver | Compassion | Martyrdom, smothering, guilt-based retention |
| Creator | Craft | Perfectionism, self-indulgence, shipping nothing |
| Ruler | Order | Rigidity, exclusion, authority used to intimidate |

## Where to look

Shadow hides where the brand is under pressure and nobody designed for tone:

1. **Leaving**: cancellation, downgrade, and offboarding flows
2. **Failing**: error states, outage notices, apology emails
3. **Charging**: pricing pages, upsells, renewal reminders
4. **Competing**: comparison pages, attack ads, "why switch" copy
5. **Crisis**: public statements when something went wrong
6. **Inside**: job posts, culture docs, how the team describes customers

## Procedure

1. Start from the dominant and secondary archetypes. If unknown, say so and
   recommend `archetype-diagnosis` first.
2. For each pressure point you have artifacts for, check for the shadow forms
   of both archetypes. Quote the exact words or describe the exact behavior.
3. Rate each leak: **High** (harms users or trust, e.g. guilt-tripping on
   cancel), **Medium** (erodes the gift), **Low** (tone only).
4. Find the **repressed opposite**: the archetype the brand mocks or refuses
   to be. What a brand ridicules is often what it's missing (a Ruler brand
   that mocks playfulness has repressed its Jester). Note the risk and whether
   a small, deliberate dose would help.
5. Write integration moves: how to keep the gift while closing each leak.

## Output format

```
SHADOW ANALYSIS: <subject>
═══════════════════════════
Foundation:  <dominant> / <secondary>
Gift:        <gift>
Shadow:      <shadow form>

LEAKS DETECTED
──────────────
▸ [High]   <pressure point>: "<quote or behavior>"
           Shadow: <which form>, because <reason>
▸ [Medium] ...

PRESSURE POINTS NOT REVIEWED
────────────────────────────
▸ <pressure point>: artifact needed: <what>

REPRESSED OPPOSITE
──────────────────
▸ <archetype>: evidence: <what they mock or refuse>; risk: <risk>

INTEGRATION MOVES
─────────────────
1. <move>, keeps <gift>, closes <leak>
```

## Guardrails

- Evidence-bound. Never invent a leak to fill the report. "No leaks found in
  the artifacts reviewed" is a valid finding; list what wasn't reviewed.
- Separate tone problems from harm. Dark patterns that cost users money or
  trust are High regardless of how on-brand they sound.
- Don't recommend abandoning the archetype. The cure for shadow is integration,
  not a different costume.
