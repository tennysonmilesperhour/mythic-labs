---
name: brand-architecture
description: Phase 02 of the Mythic Labs method — map whether a brand's product, audience, and surface expression all rest on the same archetypal foundation. Use when someone asks "does our product match our brand," "why does our marketing feel off," "how should we relate to our audience," "how do our sub-brands fit together," or suspects a brand is wearing a costume. Returns a relationship map (aligned, tension, fracture), an integration verdict, and ranked structural moves. Needs a known foundational archetype; if none exists, run archetype-diagnosis first.
---

# Brand Architecture — Phase 02: Structural Relationships

Phase 01 found the foundation. This phase checks whether everything built on
it — the product, the audience relationship, the visible surface — rests on
that same foundation, or on something else.

Method position: 01 `archetype-diagnosis` → **02 Architecture** (this skill) →
03 `unified-expression`.

## Inputs

- The foundational archetype (dominant + secondary) with its confidence.
  If missing, say so and run Phase 01 first — don't guess a foundation.
- Artifacts for each layer: product behavior, audience voice, and surface
  expression (site, ads, visual identity).

## The three relationships

### 1. Brand ↔ Product
Does the product's **behavior** enact the foundation?
List three concrete behaviors (a default, a pricing choice, what it makes hard,
how it handles failure). For each, name the archetype it enacts.

- All three match → **Aligned**
- One differs, with a coherent story → **Tension** (often fine, sometimes the secondary archetype)
- Behavior enacts a different archetype → **Fracture**. This is a product decision, not a branding problem. Say so.

### 2. Brand ↔ Audience
Define the audience by the **identity they are moving toward**, not demographics.

- **Matching** — the audience already identifies with the archetype and wants
  a mirror (Explorers buying from an Explorer brand).
- **Complementary** — the audience needs what the archetype provides
  (anxious first-time parents in an Innocent-under-threat state, served by a
  Caregiver brand).
- **Mismatch** — the brand assumes a mirror when the audience needs a
  complement, or the reverse. A Hero brand challenging an audience that wants
  to be cared for is a mismatch.

Neither matching nor complementary is better. Only mismatch is a problem.

### 3. Surface ↔ Foundation
Does the current expression wear the foundation, or a **costume**?
Costume signals: surface tells (palette, slogans, imagery) belong to a
different archetype than the behavior; the expression borrows a category trend;
the tone shifts sharply between marketing and product UI.

### Portfolio (only if there are sub-brands or multiple products)
Sub-brands may lead with a different archetype, but should share the parent's
foundation as their secondary. A sub-brand with no shared archetype reads as an
acquisition, not a family.

## Integration verdict

- **Integrated** — all relationships aligned or matching/complementary
- **Partially integrated** — at least one tension, no fractures
- **Fractured** — any fracture, mismatch, or costume

## Output format

```
BRAND ARCHITECTURE — <subject>
══════════════════════════════
Foundation:  <dominant> / <secondary>   [Phase 01 confidence]

RELATIONSHIPS
─────────────
Brand ↔ Product        <Aligned | Tension | Fracture>
  ▸ <behavior> enacts <archetype>
Brand ↔ Audience       <Matching | Complementary | Mismatch>
  ▸ audience is becoming <identity>; brand offers <archetype gift>
Surface ↔ Foundation   <Worn | Costume>
  ▸ <surface tell> belongs to <archetype>

INTEGRATION
───────────
Verdict:                   <integrated | partially integrated | fractured>
Highest-leverage fracture: <one sentence>

STRUCTURAL MOVES  (ranked)
──────────────────────────
1. <move> — because <structural reason>
2. <move> — because <structural reason>

NEXT
────
Phase 03 → unified-expression   (shadow risks → shadow-analysis)
```

## Guardrails

- Fix structure before surface. Expression changes come in Phase 03.
- When surface and foundation disagree, change the surface — unless the
  product behavior itself contradicts the foundation, which is a decision for
  the people who own the product.
- Every relationship rating cites an artifact.
- Never redefine the foundation in this phase. If Phase 01 looks wrong, flag it
  and recommend re-running it.
