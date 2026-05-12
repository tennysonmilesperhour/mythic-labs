---
description: Run a fast archetypal diagnosis on a brand, product, or piece of copy. Pass the target as an argument or paste the artifact.
argument-hint: <brand-name | URL | paste artifact>
---

You've been asked to run a fast archetypal diagnosis on: **$ARGUMENTS**

Steps:

1. If `$ARGUMENTS` is a URL, fetch it with WebFetch and extract the public-facing artifacts (copy, taglines, hero imagery descriptions).
2. If it's a brand name, search for the primary site and recent material.
3. If it's pasted copy, work directly with the text.
4. Invoke the `archetypal-analyst` agent via the Agent tool with the gathered material.
5. Return the diagnosis in the format the analyst specifies.

Keep total tool calls under 6. If evidence is thin, say so in the report rather than padding.
