---
name: unified-expression
description: Phase 03 of the Mythic Labs method — translate a brand's diagnosed archetypal structure into an enforceable Expression Spec covering voice, visual direction, interface, naming, and service rituals. Use when someone asks "how should we sound," "how should this look," "turn our archetype into brand guidelines," "what should we name this," or needs design direction grounded in brand identity rather than trends. Returns a spec of do/never rules, each tied to a structural reason, that voice-audit can check copy against. Needs a known foundational archetype.
---

# Unified Expression — Phase 03: Expression

Phases 01 and 02 established what the brand *is* and how its parts relate.
This phase writes the rules for how that structure appears everywhere — so a
copywriter, a designer, and an engineer writing an error message all express
the same foundation.

Method position: 01 `archetype-diagnosis` → 02 `brand-architecture` →
**03 Expression** (this skill). Check finished copy with `voice-audit`.

Use `markers.md` in this skill's directory for per-archetype starting points.

## Inputs

- Foundation: dominant + secondary archetype (required — if missing, stop and
  recommend Phase 01).
- Architecture findings and shadow risks, if available. Rules must close the
  fractures and leaks found there.
- Constraints: existing assets that must stay, channels, audience context.

## Procedure

1. Pull starting markers for the dominant from `markers.md`. Apply the
   secondary to one dimension only.
2. For each spec section, write **at most seven rules**. Enforceable beats
   exhaustive.
3. Write every rule as a **do / never** pair with a **because** clause tied to
   the structure. "Because Caregiver: the reader should feel held, never
   managed." A rule with no structural reason gets cut.
4. Close known gaps: each fracture from Phase 02 and each High leak from
   `shadow-analysis` needs at least one rule that addresses it.
5. Add two **on-voice examples** and one **off-voice example** per section,
   written for this brand, so the rules are testable.

## Spec sections

- **Voice** — register, stance to the reader, rhythm, words to use and avoid,
  signature moves, forbidden moves
- **Visual** — temperature, density (spare ↔ ornate), contrast, typographic
  character, imagery subjects, motion character
- **Interface** — governing metaphor, microcopy stance, error and empty states,
  defaults that express the archetype
- **Naming** — principles for product and feature names, with two passing and
  two failing candidates
- **Rituals** — onboarding, failure and recovery, farewell (cancellation):
  how the archetype shows up at each moment

## Output format

```
EXPRESSION SPEC — <subject>
═══════════════════════════
Foundation:  <dominant> / <secondary, applied to: dimension>
Closes:      <fractures and leaks this spec addresses>

VOICE
─────
1. DO    <rule>
   NEVER <rule>
   BECAUSE <structural reason>
   ✓ "<on-voice example>"
   ✗ "<off-voice example>"

VISUAL
──────
...

INTERFACE · NAMING · RITUALS
────────────────────────────
...

AUDIT HOOK
──────────
voice-audit should check: <the 3–5 rules most likely to drift>
```

## Guardrails

- No trend aesthetics as rules ("clean and modern," "bold and fresh"). Name the
  archetypal quality instead.
- Don't contradict assets the user said must stay — work with them.
- The secondary archetype modulates; it never takes over a whole section.
- Examples must be written for this brand, never generic placeholders.
- If Phase 02 found a product-level fracture, note that no expression rule can
  fix it.
