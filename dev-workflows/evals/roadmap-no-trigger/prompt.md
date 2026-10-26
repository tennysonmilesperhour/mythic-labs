---
description: A plain code question must not pull in the roadmap skill.
tags: [routing, guardrail]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Why does this return undefined?

```js
function total(items) {
  items.reduce((sum, i) => sum + i.price, 0);
}
```
