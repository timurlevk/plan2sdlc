---
name: triage
description: Classify and prioritize backlog items
---

# TRIAGE Session

Classify and prioritize all inbox/triaged backlog items.

## Entry Criteria
- >3 inbox items, weekly cadence, or manual trigger
- `/sdlc triage` command

## Process

1. **Dispatch governance-architect**
2. Load all inbox + triaged items from `.sdlc/backlog.json`
3. For each item:
   - Classify type and complexity (if not already classified)
   - Assess domain impact
   - Propose priority (critical → low)
4. Present prioritized list to user:
   ```
   TRIAGE RESULTS
   ───────────────────────────────────────────────────────
   #1  TASK-043  [M] bugfix   → critical  "Login redirect loop"
   #2  TASK-042  [L] feature  → high      "Daily rewards system"
   #3  TASK-044  [S] refactor → medium    "Extract stat utils"
   ...
   ```
5. **HITL: user approves priority assignments**
6. Update backlog items with new priorities
7. Optionally dispatch top N items to appropriate session chains

## Participants
- governance-architect (mandatory)
- product-analyst (for feature prioritization)

## HITL
Priority approval.

## Output
- Updated backlog with priorities
- Optional: dispatched top items to workflows
