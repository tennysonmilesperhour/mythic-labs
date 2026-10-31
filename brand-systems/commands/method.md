---
description: Run the full Mythic Labs method (Discovery, Architecture, Shadow, Expression) on a brand, product, or set of artifacts and return a diagnostic dossier.
argument-hint: <brand-name | URL | paste artifacts>
---

Run the full Mythic Labs method on: **$ARGUMENTS**

1. **Gather.** If `$ARGUMENTS` is a URL, fetch it and any linked pricing,
   about, or help pages. If it's a name, find the primary site. If it's pasted
   material, work from the text. Stay under 8 tool calls.
2. **Phase 01.** Follow the `archetype-diagnosis` skill. If confidence comes
   back low, stop here: return the Phase 01 report and the list of artifacts
   that would raise confidence. Don't build later phases on a guess.
3. **Phase 02.** Follow `brand-architecture` using the Phase 01 foundation.
4. **Shadow.** Follow `shadow-analysis` on whichever pressure points you have
   artifacts for, and list the ones you couldn't review.
5. **Phase 03.** Follow `unified-expression` to write the Expression Spec,
   closing every fracture and High leak found above.
6. **Assemble** one dossier with the four reports in order, preceded by a
   five-line summary: foundation, integration verdict, worst leak, top
   structural move, top expression rule.

For a large research job, delegate steps 1-5 to the `archetypal-analyst`
agent and then write the full Expression Spec yourself.
