---
name: sdlc-team
description: Show agent registry health and performance
user-invocable: true
---

# /sdlc team

Show agent registry health and performance metrics.

## Instructions

1. Read `.sdlc/registry.yaml` for agent roster
2. Read `.sdlc/history/` for session logs
3. Compute agent metrics using the metrics service
4. Format output:

```
AGENT REGISTRY                  STATUS   SUCCESS  AVG $   AVG TURNS  LAST USED
────────────────────────────────────────────────────────────────────────────────
governance-architect            active   92%      $2.10   8          2h ago
governance-reviewer             active   100%     $1.50   5          1h ago
api-developer                   active   85%      $3.80   22         30m ago
api-tester                      active   90%      $1.20   12         1h ago
web-developer                   active   88%      $3.50   20         2h ago
...

ALERTS:
⚠ {agent} retry rate {n}% (threshold: 15%) — prompt refinement needed?
⚠ {agent} success rate {n}% (threshold: 80%) — investigate failures
⚠ {agent} unused for 30+ days — consider removing
```

If no metrics data: show agent list with "No metrics data yet."
If `.sdlc/` not found: "⚠ SDLC not initialized. Run /sdlc init first."
