---
name: archetype-diagnosis
description: Phase 01 of the Mythic Labs method: diagnose the foundational archetype of a brand, product, or audience from evidence. Use when someone asks "what archetype is this," "what's our foundational pattern," "who are we really," or is exploring brand identity, naming, or positioning from scratch. Returns dominant, secondary, and shadow-risk archetypes with confidence levels and cited evidence. Not for reviewing existing copy against a known archetype (use voice-audit) or for brand-product fit (use brand-architecture).
---

# Archetype Diagnosis (Phase 01: Discovery)

You are in **diagnostic mode**. The brand already has a foundational structure.
Your job is to uncover the one already there, from evidence.

This is the first of three phases:
**01 Discovery** (this skill) → **02 Architecture** (`brand-architecture`) →
**03 Expression** (`unified-expression`). Run `shadow-analysis` for risks.

Use `archetypes.md` in this skill's directory for the twelve archetypes, their
tells, and the discriminating questions for confused pairs.

## Procedure

1. **Inventory evidence.** List every artifact you have, tagged by type:
   - *Behavior*: what the product does, prices, defaults, makes easy or hard
   - *Copy*: taglines, site text, UI microcopy, emails
   - *Stated values*: mission, manifesto, founder statements
   - *Audience voice*: reviews, testimonials, community language

   Behavior outweighs copy, which outweighs stated values.

2. **Read desire and fear.** For each artifact, note what it promises people
   will *become* and what it pushes against. The deepest promise points to the
   core desire; the thing it pushes against points to the core fear.

3. **Shortlist two or three candidates** from `archetypes.md` whose desire,
   fear, and tells match.

4. **Separate close pairs.** For any confused pair on the shortlist, ask the
   discriminating question and record which way the evidence falls.

5. **Assign** one dominant, one secondary, and the most likely shadow risk.
   Never output two dominants. If you can't choose, confidence is low.

6. **Behavior check.** Does the dominant explain the product's behavior, not
   only its copy? If the copy says one archetype and the behavior enacts
   another, the behavior is the foundation; say so explicitly.

## Confidence rubric

| Level | Requires |
|---|---|
| High | ≥3 independent artifacts agree, at least one is behavior, no strong counter-evidence |
| Medium | 2 agreeing artifacts, or copy-only evidence, or one unresolved confused pair |
| Low | A single artifact, conflicting signals, or evidence that is only aspirational |

If confidence is low, still give your best reading, then list exactly which
artifacts would raise it (e.g. "pricing page," "cancellation flow,"
"three customer reviews").

## Output format

```
ARCHETYPAL DIAGNOSIS: <subject>
════════════════════════════════
Dominant:     <archetype>   [confidence: high | medium | low]
Secondary:    <archetype>
Shadow risk:  <shadow form of the dominant>

EVIDENCE
────────
▸ [behavior] <artifact>: <desire/fear signal>
▸ [copy]     <artifact>: <signal>

DISCRIMINATION
──────────────
▸ <pair>: <question> → <answer and evidence>

STRUCTURAL CLAIMS
─────────────────
1. <claim about the foundational identity>
2. <claim about what it lets people become>
3. <claim about any copy/behavior split>

TO RAISE CONFIDENCE
───────────────────
▸ <artifact that would settle the open question>

NEXT
────
Phase 02 → brand-architecture
```

## Guardrails

- Cite an artifact for every claim. No claims from reputation or vibes.
- Diagnose what the evidence shows, even when the brand wishes otherwise.
- No trend language ("modern," "fresh," "disruptive") as structural evidence.
- When diagnosing a real company, work only from artifacts you actually read.
- Don't propose rebrands in this phase; expression comes in Phase 03.
