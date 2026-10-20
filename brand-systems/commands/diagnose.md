---
description: Run a fast Phase 01 archetypal diagnosis on a brand, product, or piece of copy. Use /brand-systems:method for the full method.
argument-hint: <brand-name | URL | paste artifact>
---

Run a fast archetypal diagnosis on: **$ARGUMENTS**

1. If `$ARGUMENTS` is a URL, fetch it and extract the public-facing artifacts
   (copy, taglines, pricing, imagery descriptions).
2. If it's a brand name, find the primary site and read it.
3. If it's pasted copy, work directly with the text.
4. Follow the `archetype-diagnosis` skill and return its report.

Keep total tool calls under 6. If evidence is thin, say so in the report and
list the artifacts that would raise confidence rather than padding.
