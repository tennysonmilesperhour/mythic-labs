---
name: design-brief
description: Translate an archetypal diagnosis into a concrete design brief that downstream tools (Canva, Wix, designers) can act on. Use when the user has done brand discovery and now needs deliverables. Outputs spec sheets, not mood boards — specific palettes, type pairings, spatial rules, and motion principles tied to the archetypal foundation.
---

# Design Brief Generator

Bridge between archetypal diagnosis (the "why") and production design (the "what").

## Inputs

- An archetypal diagnosis (run `brand-systems:archetype-diagnosis` first if missing)
- The deliverable type (landing page, deck, social asset, brand guide, etc.)
- Constraints (existing palette, mandatory elements, technical limits)

## Translation Rules

For each design dimension, derive specs from the archetype:

| Dimension | Sage | Lover | Outlaw | Creator | Caregiver |
|---|---|---|---|---|---|
| **Palette** | Muted, earthy, paper | Warm reds, deep velvets | High contrast, blacks, electric | Bright, primary-adjacent | Soft, supportive neutrals |
| **Type** | Serif display, generous tracking | Italic, ligature-rich | Bold sans, condensed | Geometric, unexpected | Humanist sans, soft |
| **Spacing** | Generous, editorial | Intimate, close | Tight, urgent | Modular, gridded | Roomy, breathing |
| **Motion** | Slow, deliberate | Sustained, breath-paced | Sharp, percussive | Playful, surprising | Gentle, easing |

(Extend the matrix as needed for the other seven archetypes.)

## Output Format

```
DESIGN BRIEF — <deliverable>
════════════════════════════
Anchor archetype:  <name>
Foundational mood: <one phrase>

PALETTE
───────
Primary:    #<hex>  <name>
Accent:     #<hex>  <name>
Neutral 1:  #<hex>
Neutral 2:  #<hex>

TYPOGRAPHY
──────────
Display:    <typeface> · <weight> · <tracking>
Body:       <typeface> · <weight> · <tracking>
Mono:       <typeface> (if needed)

SPATIAL RULES
─────────────
Container width:   <px / vw>
Section padding:   <vertical> / <horizontal>
Grid:              <columns × gutter>

MOTION PRINCIPLES
─────────────────
Easing:    <cubic-bezier or named>
Duration:  <ms range>
Intent:    <what motion should feel like>

DELIVERABLES
────────────
□ <asset>  ·  <dimensions>  ·  <format>
□ <asset>  ·  <dimensions>  ·  <format>
```

## Guardrails

- Don't reach for a trending palette. Reach for the archetypally honest one.
- If the deliverable type wasn't specified, ask once before generating.
- Specs should be precise enough to hand directly to Canva via MCP.
